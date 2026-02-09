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
 * Maps dashboard dimension IDs to database column names (ads table columns)
 */
const dimensionMap: Record<string, string> = {
  network: 'network',
  campaign: 'campaign_name',
  adset: 'adset_name',
  ad: 'ad_name',
  date: 'date',
};

/**
 * Classification dimensions that require JOINs to app_campaign_classifications
 */
interface ClassificationDimConfig {
  /** SQL expression for SELECT ... AS dimension_value */
  selectExpr: string;
  /** SQL expression for GROUP BY */
  groupByExpr: string;
  /** SQL expression for WHERE clause filtering (parent filters) */
  filterExpr: string;
}

const classificationDimMap: Record<string, ClassificationDimConfig> = {
  classifiedProduct: {
    selectExpr: "COALESCE(ap.name, 'Unknown')",
    groupByExpr: 'ap.name',
    filterExpr: 'ap.name',
  },
  classifiedCountry: {
    selectExpr: "COALESCE(cc.country_code, 'Unknown')",
    groupByExpr: 'cc.country_code',
    filterExpr: 'cc.country_code',
  },
};

function isClassificationDim(dim: string): boolean {
  return dim in classificationDimMap;
}

/** Check if any dimension in the hierarchy needs classification JOINs */
function needsClassificationJoins(
  currentDim: string,
  parentFilters?: Record<string, string>
): boolean {
  if (isClassificationDim(currentDim)) return true;
  if (parentFilters) {
    return Object.keys(parentFilters).some(isClassificationDim);
  }
  return false;
}

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
 * Maps sort keys to AggregatedMetrics property names for JavaScript-side sorting
 */
const jsSortMap: Record<string, keyof AggregatedMetrics> = {
  cost: 'cost',
  clicks: 'clicks',
  impressions: 'impressions',
  conversions: 'conversions',
  ctr: 'ctr_percent',
  cpc: 'cpc',
  cpm: 'cpm',
  conversionRate: 'conversion_rate',
  crmSubscriptions: 'crm_subscriptions',
  approvedSales: 'approved_sales',
  approvalRate: 'approval_rate',
  realCpa: 'real_cpa',
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
    return sourceLower === 'facebook' || sourceLower === 'meta' || sourceLower === 'fb';
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
    // Check classification dimensions first
    const classConfig = classificationDimMap[dimId];
    if (classConfig) {
      if (value === 'Unknown') {
        conditions.push(`${classConfig.filterExpr} IS NULL`);
      } else {
        params.push(value);
        conditions.push(`${classConfig.filterExpr} = $${paramOffset + params.length}`);
      }
      return;
    }

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
 * Queries PostgreSQL for aggregated ad metrics, then matches CRM subscription data
 * from MariaDB via tracking IDs (campaign_id, adset_id, ad_id).
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

  const effectiveProductFilter = productFilter;
  const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));

  const currentDimension = dimensions[depth];
  const classConfig = classificationDimMap[currentDimension];
  const sqlColumn = classConfig ? null : dimensionMap[currentDimension];

  if (!sqlColumn && !classConfig) {
    throw new Error(`Unknown dimension: ${currentDimension}`);
  }

  const sortColumn = metricMap[sortBy] || 'clicks';
  const finalSortColumn = currentDimension === 'date' ? sqlColumn! : sortColumn;
  const finalSortDirection = currentDimension === 'date' ? 'DESC' : validateSortDirection(sortDirection);

  // Classification JOINs needed?
  const useClassificationJoins = needsClassificationJoins(currentDimension, parentFilters);

  const pgParams: any[] = [
    formatLocalDate(dateRange.start),
    formatLocalDate(dateRange.end),
  ];

  const { whereClause, params: filterParams } = buildParentFilters(
    parentFilters,
    pgParams.length
  );
  pgParams.push(...filterParams);

  const { whereClause: tableFilterClause, params: tableFilterParams } = buildTableFilters(
    filters,
    pgParams.length
  );
  pgParams.push(...tableFilterParams);

  // Build SELECT/GROUP BY/JOIN based on dimension type
  const selectDimExpr = classConfig ? classConfig.selectExpr : sqlColumn!;
  const groupByExpr = classConfig ? classConfig.groupByExpr : sqlColumn!;

  const classificationJoinClause = useClassificationJoins
    ? `LEFT JOIN app_campaign_classifications cc ON m.campaign_id = cc.campaign_id AND cc.is_ignored = false
       LEFT JOIN app_products ap ON cc.product_id = ap.id`
    : '';

  const adsQuery = `
    SELECT
      ${selectDimExpr} AS dimension_value,
      ROUND(SUM(m.cost::numeric), 2) AS cost,
      SUM(m.clicks::integer) AS clicks,
      SUM(m.impressions::integer) AS impressions,
      ROUND(SUM(m.conversions::numeric), 0) AS conversions,
      ROUND(SUM(m.clicks::integer)::numeric / NULLIF(SUM(m.impressions::integer), 0), 4) AS ctr_percent,
      ROUND(SUM(m.cost::numeric) / NULLIF(SUM(m.clicks::integer), 0), 2) AS cpc,
      ROUND(SUM(m.cost::numeric) / NULLIF(SUM(m.impressions::integer), 0) * 1000, 2) AS cpm,
      ROUND(SUM(m.conversions::numeric) / NULLIF(SUM(m.impressions::integer), 0), 6) AS conversion_rate,
      array_agg(DISTINCT m.campaign_id) AS campaign_ids,
      array_agg(DISTINCT m.adset_id) AS adset_ids,
      array_agg(DISTINCT m.ad_id) AS ad_ids,
      array_agg(DISTINCT m.network) AS networks
    FROM merged_ads_spending m
    ${classificationJoinClause}
    WHERE m.date::date BETWEEN $1::date AND $2::date
      ${whereClause}
      ${tableFilterClause}
    GROUP BY ${groupByExpr}
    ORDER BY ${finalSortColumn} ${finalSortDirection}
    LIMIT ${safeLimit}
  `;

  type AdsRowWithMappings = AggregatedMetrics & {
    campaign_ids: string[];
    adset_ids: string[];
    ad_ids: string[];
    networks: string[];
  };

  const crmFilters: CRMQueryFilters = {
    dateStart: `${formatLocalDate(dateRange.start)} 00:00:00`,
    dateEnd: `${formatLocalDate(dateRange.end)} 23:59:59`,
    productFilter: effectiveProductFilter,
  };

  const [adsData, crmData] = await Promise.all([
    executeQuery<AdsRowWithMappings>(adsQuery, pgParams),
    getCRMSubscriptions(crmFilters),
  ]);

  const crmIndex = new Map<string, CRMSubscriptionRow[]>();
  for (const crm of crmData) {
    const key = `${crm.campaign_id}|${crm.adset_id}|${crm.ad_id}`;
    if (!crmIndex.has(key)) {
      crmIndex.set(key, []);
    }
    crmIndex.get(key)!.push(crm);
  }

  return adsData.map(row => {
    let crm_subscriptions = 0;
    let approved_sales = 0;

    const campaignIds = row.campaign_ids || [];
    const adsetIds = row.adset_ids || [];
    const adIds = row.ad_ids || [];
    const networkList = row.networks || [];

    for (const campaignId of campaignIds) {
      for (const adsetId of adsetIds) {
        for (const adId of adIds) {
          const key = `${campaignId}|${adsetId}|${adId}`;
          const crmRows = crmIndex.get(key);
          if (!crmRows) continue;

          for (const crm of crmRows) {
            const sourceMatched = networkList.some(n => matchSource(n, crm.source));
            if (sourceMatched) {
              crm_subscriptions += Number(crm.subscription_count || 0);
              approved_sales += Number(crm.approved_count || 0);
            }
          }
        }
      }
    }

    const cost = Number(row.cost) || 0;
    return {
      dimension_value: row.dimension_value,
      cost,
      clicks: Number(row.clicks) || 0,
      impressions: Number(row.impressions) || 0,
      conversions: Number(row.conversions) || 0,
      ctr_percent: Number(row.ctr_percent) || 0,
      cpc: Number(row.cpc) || 0,
      cpm: Number(row.cpm) || 0,
      conversion_rate: Number(row.conversion_rate) || 0,
      crm_subscriptions,
      approved_sales,
      approval_rate: crm_subscriptions > 0 ? approved_sales / crm_subscriptions : 0,
      real_cpa: approved_sales > 0 ? cost / approved_sales : 0,
    };
  });
}

