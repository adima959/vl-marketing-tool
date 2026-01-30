import { executeQuery } from './db';
import { getCRMSubscriptions, type CRMQueryFilters } from './marketingCrmQueries';

export interface AdsRow {
  network: string;
  date: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  cost: number;
  currency: string;
  clicks: number;
  impressions: number;
  ctr_percent: number;
  cpc: number;
  cpm: number;
  conversions: number;
}

export interface MarketingRow extends AdsRow {
  crm_subscriptions: number;
  approved_sales: number;
}

export interface MarketingQueryParams {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  depth: number;
  parentFilters?: Record<string, string>;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
  productFilter?: string; // Optional: '%Balansera%'
  limit?: number;
}

export interface AggregatedMetrics {
  dimension_value: string;
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr_percent: number;
  cpc: number;
  cpm: number;
  conversion_rate: number;
  crm_subscriptions: number;
  approved_sales: number;
  approval_rate: number;
  real_cpa: number;
}

/**
 * Maps dashboard dimension IDs to database column names
 */
const dimensionMap: Record<string, string> = {
  network: 'network',
  campaign: 'campaign_name',
  adset: 'adset_name',
  ad: 'ad_name',
  date: 'date',
};

/**
 * Maps dashboard metric IDs to SQL expressions
 */
const metricMap: Record<string, string> = {
  cost: 'cost',
  clicks: 'clicks',
  impressions: 'impressions',
  conversions: 'conversions',
  ctr: 'ctr_percent',
  cpc: 'cpc',
  cpm: 'cpm',
  conversionRate: 'conversion_rate',
};

/**
 * Match network name to CRM source
 */
function matchSource(network: string, source: string | null): boolean {
  if (!source) return false; // Handle null source from CRM data

  const networkLower = network.toLowerCase();
  const sourceLower = source.toLowerCase();

  if (networkLower === 'google ads') {
    return sourceLower === 'adwords' || sourceLower === 'google';
  }

  if (networkLower === 'facebook') {
    return sourceLower === 'facebook' || sourceLower === 'meta';
  }

  return false;
}

/**
 * Builds parent filter WHERE clause
 */
function buildParentFilters(
  parentFilters: Record<string, string> | undefined,
  paramOffset: number
): { whereClause: string; params: any[] } {
  if (!parentFilters || Object.keys(parentFilters).length === 0) {
    return { whereClause: '', params: [] };
  }

  const params: any[] = [];
  const conditions: string[] = [];

  Object.entries(parentFilters).forEach(([dimId, value]) => {
    const sqlColumn = dimensionMap[dimId];
    if (!sqlColumn) {
      throw new Error(`Unknown dimension in parent filter: ${dimId}`);
    }
    params.push(value);
    conditions.push(`${sqlColumn} = $${paramOffset + params.length}`);
  });

  return {
    whereClause: `AND ${conditions.join(' AND ')}`,
    params,
  };
}

/**
 * Auto-detect product filter from campaign name
 * Looks for product names in campaign name and returns LIKE pattern
 */
function detectProductFilter(campaignName: string | undefined): string | undefined {
  if (!campaignName) return undefined;

  const campaignLower = campaignName.toLowerCase();

  // Known products - add more as needed
  const productPatterns = [
    { pattern: 'balansera', filter: '%Balansera%' },
    { pattern: 'brainy', filter: '%Brainy%' },
    // Add more products here as needed
  ];

  for (const { pattern, filter } of productPatterns) {
    if (campaignLower.includes(pattern)) {
      return filter;
    }
  }

  return undefined;
}

/**
 * Get marketing data with two-database approach (PostgreSQL for ads, MariaDB for CRM)
 * Supports hierarchical loading like the original queryBuilder
 */
export async function getMarketingData(
  params: MarketingQueryParams
): Promise<AggregatedMetrics[]> {
  const {
    dateRange,
    dimensions,
    depth,
    parentFilters,
    sortBy = 'cost',
    sortDirection = 'DESC',
    productFilter,
    limit = 1000,
  } = params;

  // Keep explicit product filter if provided (for manual testing)
  // But don't auto-detect globally - we'll detect per-row instead
  let effectiveProductFilter = productFilter;

  // Validate depth
  if (depth >= dimensions.length) {
    throw new Error(`Depth ${depth} exceeds dimensions length ${dimensions.length}`);
  }

  // Validate limit
  const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));

  // Get current dimension to group by
  const currentDimension = dimensions[depth];
  const sqlColumn = dimensionMap[currentDimension];

  if (!sqlColumn) {
    throw new Error(`Unknown dimension: ${currentDimension}`);
  }

  // Get sort column
  const sortColumn = metricMap[sortBy] || 'clicks';
  const finalSortColumn = currentDimension === 'date' ? sqlColumn : sortColumn;
  const finalSortDirection = currentDimension === 'date' ? 'DESC' : sortDirection;

  // Step 1: Build PostgreSQL query for aggregated ads data
  const pgParams: any[] = [
    dateRange.start.toISOString().split('T')[0], // $1
    dateRange.end.toISOString().split('T')[0],   // $2
  ];

  // Build parent filters
  const { whereClause, params: filterParams } = buildParentFilters(
    parentFilters,
    pgParams.length
  );
  pgParams.push(...filterParams);

  // Query ads data grouped by current dimension
  const adsQuery = `
    SELECT
      ${sqlColumn} AS dimension_value,
      ROUND(SUM(cost::numeric), 2) AS cost,
      SUM(clicks::integer) AS clicks,
      SUM(impressions::integer) AS impressions,
      ROUND(SUM(conversions::numeric), 0) AS conversions,
      ROUND(SUM(clicks::integer)::numeric / NULLIF(SUM(impressions::integer), 0), 4) AS ctr_percent,
      ROUND(SUM(cost::numeric) / NULLIF(SUM(clicks::integer), 0), 2) AS cpc,
      ROUND(SUM(cost::numeric) / NULLIF(SUM(impressions::integer), 0) * 1000, 2) AS cpm,
      ROUND(SUM(conversions::numeric) / NULLIF(SUM(impressions::integer), 0), 6) AS conversion_rate
    FROM merged_ads_spending
    WHERE date BETWEEN $1 AND $2
      ${whereClause}
    GROUP BY ${sqlColumn}
    ORDER BY ${finalSortColumn} ${finalSortDirection}
    LIMIT ${safeLimit}
  `;

  const adsData = await executeQuery<AggregatedMetrics>(adsQuery, pgParams);

  // Step 2: Query MariaDB for ALL CRM data (no product filter)
  // We'll filter by product per-row during matching to ensure each campaign
  // only counts its own product's subscriptions
  const crmFilters: CRMQueryFilters = {
    dateStart: `${dateRange.start.toISOString().split('T')[0]} 00:00:00`,
    dateEnd: `${dateRange.end.toISOString().split('T')[0]} 23:59:59`,
    // No global product filter - we filter per dimension value during matching
  };

  const crmData = await getCRMSubscriptions(crmFilters);

  // Step 3: For each aggregated ads row, match with CRM data
  // We need to query raw ads data to get the mapping between dimension_value and campaign_id/adset_id/ad_id
  // Build a query to get the ID mapping for each dimension value
  const idMappingQuery = `
    SELECT DISTINCT
      ${sqlColumn} AS dimension_value,
      campaign_id,
      adset_id,
      ad_id,
      network
    FROM merged_ads_spending
    WHERE date BETWEEN $1 AND $2
      ${whereClause}
  `;

  const idMappings = await executeQuery<{
    dimension_value: string;
    campaign_id: string;
    adset_id: string;
    ad_id: string;
    network: string;
  }>(idMappingQuery, pgParams);

  // Group mappings by dimension_value
  const mappingsByDimension = new Map<string, typeof idMappings>();
  for (const mapping of idMappings) {
    const key = mapping.dimension_value;
    if (!mappingsByDimension.has(key)) {
      mappingsByDimension.set(key, []);
    }
    mappingsByDimension.get(key)!.push(mapping);
  }

  // Step 4: Match CRM data to aggregated ads data
  const result = adsData.map(row => {
    const mappings = mappingsByDimension.get(row.dimension_value) || [];
    let crm_subscriptions = 0;
    let approved_sales = 0;

    // Detect product filter for this specific dimension value
    // This ensures each campaign filters to its own product, even at depth 0/1
    const rowProductFilter = effectiveProductFilter || detectProductFilter(row.dimension_value);

    // For each possible ad combination that rolls up to this dimension value
    for (const mapping of mappings) {
      // Find matching CRM rows
      const matches = crmData.filter(crm => {
        const campaignMatch = mapping.campaign_id === crm.campaign_id;
        const adsetMatch = mapping.adset_id === crm.adset_id;
        const adMatch = mapping.ad_id === crm.ad_id;
        const sourceMatch = matchSource(mapping.network, crm.source);

        // Apply product filter per dimension value
        const productMatch = !rowProductFilter ||
          (crm.product_name && crm.product_name.toLowerCase().includes(rowProductFilter.replace(/%/g, '').toLowerCase()));

        return campaignMatch && adsetMatch && adMatch && sourceMatch && productMatch;
      });

      // Sum up CRM metrics
      for (const match of matches) {
        crm_subscriptions += Number(match.subscription_count || 0);
        approved_sales += Number(match.approved_count || 0);
      }
    }

    // Calculate derived metrics
    const cost = Number(row.cost) || 0;
    const realCpa = approved_sales > 0 ? cost / approved_sales : 0;
    const approvalRate = crm_subscriptions > 0 ? approved_sales / crm_subscriptions : 0;

    return {
      dimension_value: row.dimension_value,
      cost: Number(row.cost) || 0,
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      conversions: Number(row.conversions) || 0,
      ctr_percent: Number(row.ctr_percent) || 0,
      cpc: Number(row.cpc) || 0,
      cpm: Number(row.cpm) || 0,
      conversion_rate: Number(row.conversion_rate) || 0,
      crm_subscriptions,
      approved_sales,
      approval_rate: approvalRate,
      real_cpa: realCpa,
    };
  });

  return result;
}
