import { executeQuery } from './db';
import { getCRMSubscriptions, type CRMQueryFilters, type CRMSubscriptionRow } from './marketingCrmQueries';
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
}

export interface MarketingQueryParams {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  depth: number;
  parentFilters?: Record<string, string>;
  filters?: Array<{ field: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>;
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
 * Format a Date as 'YYYY-MM-DD' using local timezone
 * Avoids the timezone bug where toISOString().split('T')[0] returns
 * the previous day for users ahead of UTC (e.g., Europe)
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
    const sqlColumn = dimensionMap[dimId];
    if (!sqlColumn) {
      throw new Error(`Unknown dimension in parent filter: ${dimId}`);
    }

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
 * Builds top-level dimension filter WHERE clauses from user-defined filters
 */
function buildTableFilters(
  filters: MarketingQueryParams['filters'],
  paramOffset: number
): { whereClause: string; params: any[] } {
  if (!filters || filters.length === 0) {
    return { whereClause: '', params: [] };
  }

  const params: any[] = [];
  const conditions: string[] = [];

  for (const filter of filters) {
    if (!filter.value && filter.operator !== 'equals' && filter.operator !== 'not_equals') continue;

    const sqlColumn = dimensionMap[filter.field];
    if (!sqlColumn) continue;

    const colExpr = sqlColumn;
    const textExpr = `${colExpr}::text`;

    switch (filter.operator) {
      case 'equals':
        if (!filter.value) {
          conditions.push(`${colExpr} IS NULL`);
        } else {
          params.push(filter.value);
          conditions.push(`${textExpr} = $${paramOffset + params.length}`);
        }
        break;
      case 'not_equals':
        if (!filter.value) {
          conditions.push(`${colExpr} IS NOT NULL`);
        } else {
          params.push(filter.value);
          conditions.push(`(${colExpr} IS NULL OR ${textExpr} != $${paramOffset + params.length})`);
        }
        break;
      case 'contains':
        params.push(`%${filter.value}%`);
        conditions.push(`${textExpr} ILIKE $${paramOffset + params.length}`);
        break;
      case 'not_contains':
        params.push(`%${filter.value}%`);
        conditions.push(`(${colExpr} IS NULL OR ${textExpr} NOT ILIKE $${paramOffset + params.length})`);
        break;
    }
  }

  if (conditions.length === 0) return { whereClause: '', params: [] };

  return {
    whereClause: `AND ${conditions.join(' AND ')}`,
    params,
  };
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
    filters,
    sortBy = 'cost',
    sortDirection = 'DESC',
    productFilter,
    limit = 1000,
  } = params;

  // Product filter is only used when explicitly provided via API
  const effectiveProductFilter = productFilter;

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
  const finalSortDirection = currentDimension === 'date' ? 'DESC' : validateSortDirection(sortDirection);

  // Step 1: Build PostgreSQL query for aggregated ads data
  // IMPORTANT: The date column, when cast to date, already represents Denmark local dates
  // When we do date::date, PostgreSQL extracts the date in the database's timezone
  // So no date adjustment needed - use dates as-is from frontend
  const pgParams: any[] = [
    formatLocalDate(dateRange.start), // $1 - e.g., "2026-02-05"
    formatLocalDate(dateRange.end),   // $2 - e.g., "2026-02-05"
  ];

  // Build parent filters (drill-down)
  const { whereClause, params: filterParams } = buildParentFilters(
    parentFilters,
    pgParams.length
  );
  pgParams.push(...filterParams);

  // Build table filters (user-defined WHERE clauses)
  const { whereClause: tableFilterClause, params: tableFilterParams } = buildTableFilters(
    filters,
    pgParams.length
  );
  pgParams.push(...tableFilterParams);

  // Query ads data grouped by current dimension, including ID mappings via array_agg
  // This eliminates the need for a separate ID mapping query (was a second round-trip)
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
      ROUND(SUM(conversions::numeric) / NULLIF(SUM(impressions::integer), 0), 6) AS conversion_rate,
      array_agg(DISTINCT campaign_id) AS campaign_ids,
      array_agg(DISTINCT adset_id) AS adset_ids,
      array_agg(DISTINCT ad_id) AS ad_ids,
      array_agg(DISTINCT network) AS networks
    FROM merged_ads_spending
    WHERE date::date BETWEEN $1::date AND $2::date
      ${whereClause}
      ${tableFilterClause}
    GROUP BY ${sqlColumn}
    ORDER BY ${finalSortColumn} ${finalSortDirection}
    LIMIT ${safeLimit}
  `;

  type AdsRowWithMappings = AggregatedMetrics & {
    campaign_ids: string[];
    adset_ids: string[];
    ad_ids: string[];
    networks: string[];
  };

  // Step 1 & 2: Run PostgreSQL ads query and MariaDB CRM query in parallel
  const crmFilters: CRMQueryFilters = {
    dateStart: `${formatLocalDate(dateRange.start)} 00:00:00`,
    dateEnd: `${formatLocalDate(dateRange.end)} 23:59:59`,
    productFilter: effectiveProductFilter,
  };

  const [adsData, crmData] = await Promise.all([
    executeQuery<AdsRowWithMappings>(adsQuery, pgParams),
    getCRMSubscriptions(crmFilters),
  ]);

  // Step 3: Pre-index CRM data into a Map for O(1) lookups instead of O(n) scans
  const crmIndex = new Map<string, CRMSubscriptionRow[]>();
  for (const crm of crmData) {
    const key = `${crm.campaign_id}|${crm.adset_id}|${crm.ad_id}`;
    if (!crmIndex.has(key)) {
      crmIndex.set(key, []);
    }
    crmIndex.get(key)!.push(crm);
  }

  // Step 4: Match CRM data to aggregated ads data using indexed lookups
  const result = adsData.map(row => {
    let crm_subscriptions = 0;
    let approved_sales = 0;

    // Build all unique (campaign, adset, ad, network) combinations from array_agg results
    const campaignIds = row.campaign_ids || [];
    const adsetIds = row.adset_ids || [];
    const adIds = row.ad_ids || [];
    const networkList = row.networks || [];

    // For each unique ad ID tuple, look up CRM data via the index
    for (const campaignId of campaignIds) {
      for (const adsetId of adsetIds) {
        for (const adId of adIds) {
          const key = `${campaignId}|${adsetId}|${adId}`;
          const crmRows = crmIndex.get(key);
          if (!crmRows) continue;

          for (const crm of crmRows) {
            // Check network/source match
            const sourceMatched = networkList.some(n => matchSource(n, crm.source));
            if (sourceMatched) {
              crm_subscriptions += Number(crm.subscription_count || 0);
              approved_sales += Number(crm.approved_count || 0);
            }
          }
        }
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
