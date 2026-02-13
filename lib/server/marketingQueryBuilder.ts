import { executeQuery } from './db';
import { fetchCrmData, fetchSourceCrmData } from './crmQueryBuilder';
import { validateSortDirection } from './types';
import { FilterBuilder } from './queryBuilderUtils';
import { buildCrmIndex, buildOtsIndex, buildTrialIndex, matchAdsToCrm, buildSourceIndex, matchAdsToCrmBySource, computeSourceTotals } from './trackingTransforms';
import { formatLocalDate } from '@/lib/types/api';

type SqlParam = string | number | boolean | null | Date;

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
  subscriptions: number;
  trials_approved: number;
  trials: number;
  customers: number;
  ots: number;
  ots_approved: number;
  upsells: number;
  upsells_approved: number;
  on_hold: number;
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
 * Maps ad metric IDs to PostgreSQL column names for ORDER BY
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
  subscriptions: 'subscriptions',
  trialsApproved: 'trials_approved',
  trials: 'trials',
  customers: 'customers',
  ots: 'ots',
  otsApproved: 'ots_approved',
  otsApprovalRate: 'ots_approval_rate',
  upsells: 'upsells',
  upsellsApproved: 'upsells_approved',
  upsellApprovalRate: 'upsell_approval_rate',
  approvalRate: 'approval_rate',
  realCpa: 'real_cpa',
};



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

  // Determine CRM matching strategy based on current dimension
  // Network dimension: source-level matching (accurate COUNT DISTINCT totals)
  // All others: tracking matching + "Unknown" row for unmatched gap
  const trackingDims = new Set(['campaign', 'adset', 'ad']);
  const useSourceMatching = currentDimension === 'network';
  const needsUnknownRow = !useSourceMatching && !trackingDims.has(currentDimension);

  /** Normalize an ads row into the shape needed by matching functions */
  const toAdsInput = (row: AdsRowWithMappings) => ({
    campaign_ids: row.campaign_ids || [],
    adset_ids: row.adset_ids || [],
    ad_ids: row.ad_ids || [],
    networks: row.networks || [],
    cost: Number(row.cost) || 0,
    clicks: Number(row.clicks) || 0,
    impressions: Number(row.impressions) || 0,
    conversions: Number(row.conversions) || 0,
    ctr_percent: Number(row.ctr_percent) || 0,
    cpc: Number(row.cpc) || 0,
    cpm: Number(row.cpm) || 0,
    conversion_rate: Number(row.conversion_rate) || 0,
    dimension_value: row.dimension_value,
  });

  if (useSourceMatching) {
    // Source-level: CRM grouped by source → match by network → source
    const [adsData, sourceCrm] = await Promise.all([
      executeQuery<AdsRowWithMappings>(adsQuery, pgParams),
      fetchSourceCrmData({ dateRange, productFilter: effectiveProductFilter }),
    ]);

    const subIdx = buildSourceIndex(sourceCrm.subscriptionRows);
    const otsIdx = buildSourceIndex(sourceCrm.otsRows);
    const trialIdx = buildSourceIndex(sourceCrm.trialRows);

    return adsData.map((row: AdsRowWithMappings) =>
      matchAdsToCrmBySource(toAdsInput(row), subIdx, otsIdx, trialIdx)
    );
  }

  // Tracking-level: tiered matching + optional "Unknown" row
  const crmOptions = {
    dateRange,
    groupBy: { type: 'tracking' as const, dimensions: ['campaign', 'adset', 'ad', 'date'] },
    depth: 3,
    productFilter: effectiveProductFilter,
  };

  // Fetch tracking CRM + source totals (for Unknown row) in parallel
  const [adsData, trackingCrm, sourceCrm] = await Promise.all([
    executeQuery<AdsRowWithMappings>(adsQuery, pgParams),
    fetchCrmData(crmOptions),
    needsUnknownRow
      ? fetchSourceCrmData({ dateRange, productFilter: effectiveProductFilter })
      : Promise.resolve(null),
  ]);

  const crmIdx = buildCrmIndex(trackingCrm.subscriptionRows);
  const otsIdx = buildOtsIndex(trackingCrm.otsRows);
  const trialIdx = buildTrialIndex(trackingCrm.trialRows);

  const results = adsData.map((row: AdsRowWithMappings) =>
    matchAdsToCrm(toAdsInput(row), crmIdx, otsIdx, trialIdx)
  );

  // Add "Unknown" row for unmatched CRM data (source totals - tracking matched)
  if (sourceCrm && needsUnknownRow) {
    const subIdx = buildSourceIndex(sourceCrm.subscriptionRows);
    const otsSourceIdx = buildSourceIndex(sourceCrm.otsRows);
    const trialSourceIdx = buildSourceIndex(sourceCrm.trialRows);

    // Collect all networks across all ads rows
    const allNetworks = new Set<string>();
    for (const row of adsData) {
      for (const n of (row.networks || [])) allNetworks.add(n);
    }

    const totals = computeSourceTotals(subIdx, otsSourceIdx, trialSourceIdx, allNetworks);

    const matched = results.reduce(
      (acc, r) => ({
        subscriptions: acc.subscriptions + r.subscriptions,
        customers: acc.customers + r.customers,
        trials: acc.trials + r.trials,
        trials_approved: acc.trials_approved + r.trials_approved,
        ots: acc.ots + r.ots,
        ots_approved: acc.ots_approved + r.ots_approved,
        upsells: acc.upsells + r.upsells,
        upsells_approved: acc.upsells_approved + r.upsells_approved,
        on_hold: acc.on_hold + r.on_hold,
      }),
      { subscriptions: 0, customers: 0, trials: 0, trials_approved: 0, ots: 0, ots_approved: 0, upsells: 0, upsells_approved: 0, on_hold: 0 }
    );

    const gap = {
      subscriptions: Math.max(0, totals.subscriptions - matched.subscriptions),
      customers: Math.max(0, totals.customers - matched.customers),
      trials: Math.max(0, totals.trials - matched.trials),
      trials_approved: Math.max(0, totals.trials_approved - matched.trials_approved),
      ots: Math.max(0, totals.ots - matched.ots),
      ots_approved: Math.max(0, totals.ots_approved - matched.ots_approved),
      upsells: Math.max(0, totals.upsells - matched.upsells),
      upsells_approved: Math.max(0, totals.upsells_approved - matched.upsells_approved),
      on_hold: Math.max(0, totals.on_hold - matched.on_hold),
    };

    const hasGap = gap.subscriptions > 0 || gap.customers > 0 || gap.trials > 0 || gap.ots > 0;
    if (hasGap) {
      results.push({
        dimension_value: 'Unknown',
        cost: 0, clicks: 0, impressions: 0, conversions: 0,
        ctr_percent: 0, cpc: 0, cpm: 0, conversion_rate: 0,
        ...gap,
        approval_rate: gap.subscriptions > 0 ? gap.trials_approved / gap.subscriptions : 0,
        ots_approval_rate: gap.ots > 0 ? gap.ots_approved / gap.ots : 0,
        upsell_approval_rate: gap.upsells > 0 ? gap.upsells_approved / gap.upsells : 0,
        real_cpa: gap.trials_approved > 0 ? 0 / gap.trials_approved : 0,
      });
    }
  }

  return results;
}

