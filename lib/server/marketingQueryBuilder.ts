import { executeQuery } from './db';
import { getCRMSubscriptions, type CRMQueryFilters } from './marketingCrmQueries';
import { validateSortDirection } from './types';

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
  country?: string;
  sku?: string;
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
  country?: string;
  sku?: string;
}

/**
 * Maps dashboard dimension IDs to database column names and source
 */
const dimensionMap: Record<string, { column: string; source: 'ads' | 'crm' }> = {
  // Ads dimensions (from PostgreSQL)
  network: { column: 'network', source: 'ads' },
  campaign: { column: 'campaign_name', source: 'ads' },
  adset: { column: 'adset_name', source: 'ads' },
  ad: { column: 'ad_name', source: 'ads' },
  date: { column: 'date', source: 'ads' },
  // CRM dimensions (from MariaDB)
  sku: { column: 'sku', source: 'crm' },
  country: { column: 'country', source: 'crm' },
};

/**
 * CRM dimensions that require different query logic
 */
const CRM_DIMENSIONS = ['sku', 'country'];
const isCRMDimension = (dim: string): boolean => CRM_DIMENSIONS.includes(dim);

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
 * Handles "Unknown" values by converting them to IS NULL conditions
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
    const dimConfig = dimensionMap[dimId];
    if (!dimConfig) {
      throw new Error(`Unknown dimension in parent filter: ${dimId}`);
    }

    const sqlColumn = dimConfig.column;

    // Handle "Unknown" values as NULL
    if (value === 'Unknown') {
      conditions.push(`${sqlColumn} IS NULL`);
    } else {
      params.push(value);
      conditions.push(`${sqlColumn} = $${paramOffset + params.length}`);
    }
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
 * Get marketing data for CRM dimensions (SKU, Country)
 * Uses CRM-first approach: query CRM grouped by dimension, then match ads data
 */
async function getMarketingDataByCRM(
  params: MarketingQueryParams,
  currentDimension: string,
  dimConfig: { column: string; source: 'ads' | 'crm' }
): Promise<AggregatedMetrics[]> {
  const {
    dateRange,
    parentFilters,
    sortBy = 'cost',
    sortDirection = 'DESC',
    productFilter,
    limit = 1000,
  } = params;

  const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));

  // Step 1: If there are parent filters (ads dimensions), query ads DB to get tracking IDs
  let trackingIdFilter: { campaign_ids?: string[]; adset_ids?: string[]; ad_ids?: string[] } = {};

  if (parentFilters && Object.keys(parentFilters).length > 0) {
    // Build ads query to get tracking IDs for parent dimension values
    const pgParams: any[] = [
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0],
    ];

    const { whereClause, params: filterParams } = buildParentFilters(
      parentFilters,
      pgParams.length
    );
    pgParams.push(...filterParams);

    const trackingQuery = `
      SELECT DISTINCT campaign_id, adset_id, ad_id
      FROM merged_ads_spending
      WHERE date::date BETWEEN $1::date AND $2::date
        ${whereClause}
    `;

    const trackingIds = await executeQuery<{
      campaign_id: string;
      adset_id: string;
      ad_id: string;
    }>(trackingQuery, pgParams);

    // Extract unique IDs for CRM filtering
    trackingIdFilter.campaign_ids = [...new Set(trackingIds.map(t => t.campaign_id))];
    trackingIdFilter.adset_ids = [...new Set(trackingIds.map(t => t.adset_id))];
    trackingIdFilter.ad_ids = [...new Set(trackingIds.map(t => t.ad_id))];
  }

  // Step 2: Query CRM data grouped by the CRM dimension, filtered by parent tracking IDs
  const crmFilters: CRMQueryFilters = {
    dateStart: `${dateRange.start.toISOString().split('T')[0]} 00:00:00`,
    dateEnd: `${dateRange.end.toISOString().split('T')[0]} 23:59:59`,
    productFilter,
  };

  // Note: We can't directly filter CRM by multiple IDs, so we'll query all and filter in-memory
  const crmData = await getCRMSubscriptions(crmFilters);

  // Filter CRM data by parent tracking IDs if provided
  const filteredCrmData = trackingIdFilter.campaign_ids
    ? crmData.filter(row =>
        trackingIdFilter.campaign_ids!.includes(row.campaign_id) &&
        trackingIdFilter.adset_ids!.includes(row.adset_id) &&
        trackingIdFilter.ad_ids!.includes(row.ad_id)
      )
    : crmData;

  // Step 3: Group CRM data by the current dimension and aggregate subscriptions
  const crmByDimension = new Map<string, {
    subscriptions: number;
    approved: number;
    trackingIds: Set<{ campaign_id: string; adset_id: string; ad_id: string; source: string | null }>;
  }>();

  for (const row of filteredCrmData) {
    const dimValue = (row[dimConfig.column as keyof typeof row] as string | null) || 'Unknown';

    if (!crmByDimension.has(dimValue)) {
      crmByDimension.set(dimValue, {
        subscriptions: 0,
        approved: 0,
        trackingIds: new Set(),
      });
    }

    const entry = crmByDimension.get(dimValue)!;
    entry.subscriptions += Number(row.subscription_count || 0);
    entry.approved += Number(row.approved_count || 0);

    // Track unique tracking ID combinations
    const trackingKey = `${row.campaign_id}::${row.adset_id}::${row.ad_id}::${row.source}`;
    entry.trackingIds.add({
      campaign_id: row.campaign_id,
      adset_id: row.adset_id,
      ad_id: row.ad_id,
      source: row.source,
    });
  }

  // Step 4: For each CRM dimension value, query ads data for matching tracking IDs
  const results: AggregatedMetrics[] = [];

  for (const [dimValue, crmAgg] of crmByDimension.entries()) {
    // Build ads query to match these specific tracking IDs
    const trackingIdArray = Array.from(crmAgg.trackingIds);

    if (trackingIdArray.length === 0) {
      // No ads data, but we have CRM data - return with zero ads metrics
      results.push({
        dimension_value: dimValue,
        cost: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        ctr_percent: 0,
        cpc: 0,
        cpm: 0,
        conversion_rate: 0,
        crm_subscriptions: crmAgg.subscriptions,
        approved_sales: crmAgg.approved,
        approval_rate: crmAgg.subscriptions > 0 ? crmAgg.approved / crmAgg.subscriptions : 0,
        real_cpa: 0,
      });
      continue;
    }

    // Build WHERE clause for tracking IDs
    const trackingConditions = trackingIdArray.map((_, idx) => {
      const offset = 2 + (idx * 3);
      return `(campaign_id = $${offset + 1} AND adset_id = $${offset + 2} AND ad_id = $${offset + 3})`;
    }).join(' OR ');

    const pgParams: any[] = [
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0],
    ];

    trackingIdArray.forEach(tracking => {
      pgParams.push(tracking.campaign_id, tracking.adset_id, tracking.ad_id);
    });

    const adsQuery = `
      SELECT
        ROUND(SUM(cost::numeric), 2) AS cost,
        SUM(clicks::integer) AS clicks,
        SUM(impressions::integer) AS impressions,
        ROUND(SUM(conversions::numeric), 0) AS conversions,
        ROUND(SUM(clicks::integer)::numeric / NULLIF(SUM(impressions::integer), 0), 4) AS ctr_percent,
        ROUND(SUM(cost::numeric) / NULLIF(SUM(clicks::integer), 0), 2) AS cpc,
        ROUND(SUM(cost::numeric) / NULLIF(SUM(impressions::integer), 0) * 1000, 2) AS cpm,
        ROUND(SUM(conversions::numeric) / NULLIF(SUM(impressions::integer), 0), 6) AS conversion_rate
      FROM merged_ads_spending
      WHERE date::date BETWEEN $1::date AND $2::date
        AND (${trackingConditions})
    `;

    const adsResult = await executeQuery<{
      cost: number;
      clicks: number;
      impressions: number;
      conversions: number;
      ctr_percent: number;
      cpc: number;
      cpm: number;
      conversion_rate: number;
    }>(adsQuery, pgParams);

    const adsMetrics = adsResult[0] || {
      cost: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      ctr_percent: 0,
      cpc: 0,
      cpm: 0,
      conversion_rate: 0,
    };

    const cost = Number(adsMetrics.cost) || 0;
    const realCpa = crmAgg.approved > 0 ? cost / crmAgg.approved : 0;
    const approvalRate = crmAgg.subscriptions > 0 ? crmAgg.approved / crmAgg.subscriptions : 0;

    results.push({
      dimension_value: dimValue,
      cost,
      clicks: Number(adsMetrics.clicks) || 0,
      impressions: Number(adsMetrics.impressions) || 0,
      conversions: Number(adsMetrics.conversions) || 0,
      ctr_percent: Number(adsMetrics.ctr_percent) || 0,
      cpc: Number(adsMetrics.cpc) || 0,
      cpm: Number(adsMetrics.cpm) || 0,
      conversion_rate: Number(adsMetrics.conversion_rate) || 0,
      crm_subscriptions: crmAgg.subscriptions,
      approved_sales: crmAgg.approved,
      approval_rate: approvalRate,
      real_cpa: realCpa,
    });
  }

  // Step 5: Sort and limit results
  const sortColumn = sortBy || 'cost';
  const sortDir = validateSortDirection(sortDirection);

  results.sort((a, b) => {
    const aVal = a[sortColumn as keyof AggregatedMetrics] as number || 0;
    const bVal = b[sortColumn as keyof AggregatedMetrics] as number || 0;
    return sortDir === 'DESC' ? bVal - aVal : aVal - bVal;
  });

  return results.slice(0, safeLimit);
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
  const dimConfig = dimensionMap[currentDimension];

  if (!dimConfig) {
    throw new Error(`Unknown dimension: ${currentDimension}`);
  }

  const sqlColumn = dimConfig.column;

  // Check if this is a CRM dimension
  if (isCRMDimension(currentDimension)) {
    // Use CRM-first approach for CRM dimensions
    return getMarketingDataByCRM(params, currentDimension, dimConfig);
  }

  // Get sort column
  const sortColumn = metricMap[sortBy] || 'clicks';
  const finalSortColumn = currentDimension === 'date' ? sqlColumn : sortColumn;
  const finalSortDirection = currentDimension === 'date' ? 'DESC' : validateSortDirection(sortDirection);

  // Step 1: Build PostgreSQL query for aggregated ads data
  // IMPORTANT: The date column, when cast to date, already represents Denmark local dates
  // When we do date::date, PostgreSQL extracts the date in the database's timezone
  // So no date adjustment needed - use dates as-is from frontend
  const pgParams: any[] = [
    dateRange.start.toISOString().split('T')[0], // $1 - e.g., "2026-02-01"
    dateRange.end.toISOString().split('T')[0],   // $2 - e.g., "2026-02-01"
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
    WHERE date::date BETWEEN $1::date AND $2::date
      ${whereClause}
    GROUP BY ${sqlColumn}
    ORDER BY ${finalSortColumn} ${finalSortDirection}
    LIMIT ${safeLimit}
  `;

  const adsData = await executeQuery<AggregatedMetrics>(adsQuery, pgParams);

  // Step 2: Query MariaDB for ALL CRM data (no product filter)
  // We'll filter by product per-row during matching to ensure each campaign
  // only counts its own product's subscriptions
  // Use the original dates (no shifting needed)
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
    WHERE date::date BETWEEN $1::date AND $2::date
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
