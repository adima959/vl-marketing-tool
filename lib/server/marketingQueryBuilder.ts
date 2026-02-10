import { executeQuery } from './db';
import { executeMariaDBQuery } from './mariadb';
import { crmQueryBuilder } from './crmQueryBuilder';
import { formatDateForMariaDB } from './crmMetrics';
import { validateSortDirection } from './types';
import { matchNetworkToSource } from './crmMetrics';
import { FilterBuilder } from './queryBuilderUtils';

type SqlParam = string | number | boolean | null | Date;

// CRM row types for tracking-based queries
interface CRMSubscriptionRow {
  source: string | null;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  date: string;
  subscription_count: number;
  approved_count: number;
  trial_count: number;
  customer_count: number;
  upsell_count: number;
  upsells_approved_count: number;
}

interface CRMOtsRow {
  source: string | null;
  campaign_id: string;
  adset_id: string;
  ad_id: string;
  date: string;
  ots_count: number;
  ots_approved_count: number;
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
  trials: number;
  customers: number;
  ots: number;
  ots_approved: number;
  upsells: number;
  upsells_approved: number;
  approval_rate: number;
  ots_approval_rate: number;
  upsell_approval_rate: number;
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

/**
 * Filter builder for marketing queries (PostgreSQL with standard + classification dimensions)
 */
const marketingFilterBuilder = new FilterBuilder({
  dbType: 'postgres',
  dimensionMap: {
    // Standard ad dimensions
    network: 'network',
    campaign: 'campaign_name',
    adset: 'adset_name',
    ad: 'ad_name',
    date: 'date',
    // Classification dimensions
    classifiedProduct: classificationDimMap.classifiedProduct.filterExpr,
    classifiedCountry: classificationDimMap.classifiedCountry.filterExpr,
  },
});

/** Check if any dimension in the hierarchy or table filters needs classification JOINs */
function needsClassificationJoins(
  currentDim: string,
  parentFilters?: Record<string, string>,
  tableFilters?: MarketingQueryParams['filters']
): boolean {
  if (isClassificationDim(currentDim)) return true;
  if (parentFilters) {
    if (Object.keys(parentFilters).some(isClassificationDim)) return true;
  }
  if (tableFilters) {
    if (tableFilters.some(f => isClassificationDim(f.field))) return true;
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
  trials: 'trials',
  customers: 'customers',
  ots: 'ots',
  otsApprovalRate: 'ots_approval_rate',
  upsells: 'upsells',
  upsellApprovalRate: 'upsell_approval_rate',
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
 * Builds parent filter WHERE clause using FilterBuilder utility
 * Handles "Unknown" values by converting them to IS NULL conditions
 */
function buildParentFilters(
  parentFilters: Record<string, string> | undefined,
  paramOffset: number
): { whereClause: string; params: SqlParam[] } {
  return marketingFilterBuilder.buildParentFilters(parentFilters, { paramOffset });
}


/**
 * Builds top-level dimension filter WHERE clauses from user-defined filters
 */
function buildTableFilters(
  filters: MarketingQueryParams['filters'],
  paramOffset: number
): { whereClause: string; params: SqlParam[] } {
  if (!filters || filters.length === 0) {
    return { whereClause: '', params: [] };
  }

  const params: SqlParam[] = [];
  const conditions: string[] = [];

  for (const filter of filters) {
    if (!filter.value && filter.operator !== 'equals' && filter.operator !== 'not_equals') continue;

    // Check standard dimensions first, then classification dimensions
    const sqlColumn = dimensionMap[filter.field];
    const classConfig = classificationDimMap[filter.field];
    if (!sqlColumn && !classConfig) continue;

    const colExpr = sqlColumn || classConfig!.filterExpr;
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
  const useClassificationJoins = needsClassificationJoins(currentDimension, parentFilters, filters);

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

  // Build CRM queries using shared builder (tracking mode)
  const { query: crmQuery, params: crmParams } = crmQueryBuilder.buildQuery({
    dateRange,
    groupBy: { type: 'tracking', dimensions: ['campaign', 'adset', 'ad', 'date'] },
    depth: 3, // All tracking dimensions
    productFilter: effectiveProductFilter,
  });

  const { query: otsQuery, params: otsParams } = crmQueryBuilder.buildOtsQuery({
    dateRange,
    groupBy: { type: 'tracking', dimensions: ['campaign', 'adset', 'ad', 'date'] },
    depth: 3,
    productFilter: effectiveProductFilter,
  });

  const [adsData, crmData, otsData] = await Promise.all([
    executeQuery<AdsRowWithMappings>(adsQuery, pgParams),
    executeMariaDBQuery<CRMSubscriptionRow>(crmQuery, crmParams),
    executeMariaDBQuery<CRMOtsRow>(otsQuery, otsParams),
  ]);

  // Build CRM subscription index: tracking ID tuple → rows
  const crmIndex = new Map<string, CRMSubscriptionRow[]>();
  for (const crm of crmData) {
    const key = `${crm.campaign_id}|${crm.adset_id}|${crm.ad_id}`;
    if (!crmIndex.has(key)) {
      crmIndex.set(key, []);
    }
    crmIndex.get(key)!.push(crm);
  }

  // Build OTS index: tracking ID tuple → rows
  const otsIndex = new Map<string, CRMOtsRow[]>();
  for (const ots of otsData) {
    const key = `${ots.campaign_id}|${ots.adset_id}|${ots.ad_id}`;
    if (!otsIndex.has(key)) {
      otsIndex.set(key, []);
    }
    otsIndex.get(key)!.push(ots);
  }

  return adsData.map(row => {
    let crm_subscriptions = 0;
    let approved_sales = 0;
    let trials = 0;
    let customers = 0;
    let upsells = 0;
    let upsells_approved = 0;
    let ots = 0;
    let ots_approved = 0;

    const campaignIds = row.campaign_ids || [];
    const adsetIds = row.adset_ids || [];
    const adIds = row.ad_ids || [];
    const networkList = row.networks || [];

    // Match subscription-based CRM metrics
    for (const campaignId of campaignIds) {
      for (const adsetId of adsetIds) {
        for (const adId of adIds) {
          const key = `${campaignId}|${adsetId}|${adId}`;

          const crmRows = crmIndex.get(key);
          if (crmRows) {
            for (const crm of crmRows) {
              const sourceMatched = networkList.some(n => matchNetworkToSource(n, crm.source));
              if (sourceMatched) {
                crm_subscriptions += Number(crm.subscription_count || 0);
                approved_sales += Number(crm.approved_count || 0);
                trials += Number(crm.trial_count || 0);
                customers += Number(crm.customer_count || 0);
                upsells += Number(crm.upsell_count || 0);
                upsells_approved += Number(crm.upsells_approved_count || 0);
              }
            }
          }

          // Match OTS metrics (same tracking ID matching, different index)
          const otsRows = otsIndex.get(key);
          if (otsRows) {
            for (const otsRow of otsRows) {
              const sourceMatched = networkList.some(n => matchNetworkToSource(n, otsRow.source));
              if (sourceMatched) {
                ots += Number(otsRow.ots_count || 0);
                ots_approved += Number(otsRow.ots_approved_count || 0);
              }
            }
          }
        }
      }
    }

    const cost = Number(row.cost) || 0;
    const approvalDenominator = trials + ots;
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
      trials,
      customers,
      ots,
      ots_approved,
      upsells,
      upsells_approved,
      approval_rate: approvalDenominator > 0 ? (approved_sales + ots_approved) / approvalDenominator : 0,
      ots_approval_rate: ots > 0 ? ots_approved / ots : 0,
      upsell_approval_rate: upsells > 0 ? upsells_approved / upsells : 0,
      real_cpa: approved_sales > 0 ? cost / approved_sales : 0,
    };
  });
}

