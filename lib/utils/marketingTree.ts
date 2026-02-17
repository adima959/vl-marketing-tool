import type { ReportRow } from '@/types/report';
import type { SaleRow } from '@/types/sales';
import { toTitleCase } from '@/lib/formatters';
import { mapCrmSourceToNetwork } from '@/lib/utils/networkMapping';

/** Flat row from the marketing API: dimension values (strings) + base metrics (numbers) */
export type MarketingFlatRow = Record<string, string | number>;

/** CRM metrics computed from a group of SaleRow records */
interface CrmMetrics {
  customers: number;
  upsellNewCustomers: number;
  subscriptions: number;
  upsellSubs: number;
  upsellSubTrials: number;
  trials: number;
  trialsApproved: number;
  onHold: number;
  ots: number;
  otsApproved: number;
  upsells: number;
  upsellsApproved: number;
  upsellsDeleted: number;
}

// ─── CRM matching ────────────────────────────────────────────────────────────

/**
 * Maps marketing dimensions to the CRM SaleRow fields used for tracking-based matching.
 * Only ad-hierarchy and date dimensions participate — classified dimensions don't.
 */
const CRM_MATCH_FIELDS: Record<string, (sale: SaleRow) => string> = {
  network: (s) => mapCrmSourceToNetwork(s.source),
  campaign: (s) => s.tracking_id_4 ?? '',
  adset: (s) => s.tracking_id_2 ?? '',
  ad: (s) => s.tracking_id ?? '',
  date: (s) => s.date,
};

/**
 * Maps marketing dimension IDs to the marketing flat row field used for the matching key.
 * Network matches directly; campaign/adset/ad use the companion ID columns.
 */
const MARKETING_MATCH_FIELDS: Record<string, string> = {
  network: 'network',
  campaign: '_campaign_id',
  adset: '_adset_id',
  ad: '_ad_id',
  date: 'date',
};

/** Convert marketing date "dd/mm/yyyy" to CRM date "YYYY-MM-DD" */
function marketingDateToCrmDate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return parts[2] + '-' + parts[1] + '-' + parts[0];
  }
  return dateStr;
}

/** Compute CRM metrics from a group of SaleRow records (mirrors salesAggregation.ts logic) */
function computeCrmMetrics(rows: SaleRow[]): CrmMetrics {
  let customers = 0;
  let subscriptions = 0;
  let upsellSubs = 0;
  let upsellSubTrials = 0;
  let trials = 0;
  let trialsApproved = 0;
  let onHold = 0;
  let ots = 0;
  let otsApproved = 0;
  let upsells = 0;
  let upsellsApproved = 0;
  let upsellsDeleted = 0;

  const newCustomerIds = new Set<number>();
  const upsellNewCustomerIds = new Set<number>();

  for (const row of rows) {
    if (row.type === 'subscription') {
      if (row.is_upsell_sub) {
        upsellSubs++;
        if (row.has_trial) upsellSubTrials++;
        if (row.is_new_customer) upsellNewCustomerIds.add(row.customer_id);
      } else {
        subscriptions++;
        if (row.has_trial) trials++;
        if (row.is_approved) trialsApproved++;
        if (row.is_on_hold) onHold++;
        if (row.is_new_customer) newCustomerIds.add(row.customer_id);
      }
    } else if (row.type === 'ots') {
      ots++;
      if (row.is_approved) otsApproved++;
    } else if (row.type === 'upsell') {
      upsells++;
      if (row.is_deleted) upsellsDeleted++;
      if (row.is_approved && !row.is_deleted) upsellsApproved++;
    }
  }

  customers = newCustomerIds.size;
  const upsellNewCustomers = [...upsellNewCustomerIds].filter((id) => !newCustomerIds.has(id)).length;

  return { customers, upsellNewCustomers, subscriptions, upsellSubs, upsellSubTrials, trials, trialsApproved, onHold, ots, otsApproved, upsells, upsellsApproved, upsellsDeleted };
}

/** Empty CRM metrics (used for rows with no CRM match) */
const EMPTY_CRM: CrmMetrics = { customers: 0, upsellNewCustomers: 0, subscriptions: 0, upsellSubs: 0, upsellSubTrials: 0, trials: 0, trialsApproved: 0, onHold: 0, ots: 0, otsApproved: 0, upsells: 0, upsellsApproved: 0, upsellsDeleted: 0 };

/**
 * Attach CRM metrics to each marketing flat row by matching on ad tracking dimensions.
 *
 * 1. Determines which dimensions can be matched (network, campaign, adset, ad, date)
 * 2. Groups CRM sales by those matching dimensions
 * 3. For each marketing row, looks up the matching CRM group
 * 4. If classification dims cause multiple rows with the same tracking key,
 *    distributes CRM metrics proportionally by impressions
 */
export function attachCrmMetrics(
  flatRows: MarketingFlatRow[],
  crmSales: SaleRow[],
  dimensions: string[],
): MarketingFlatRow[] {
  if (crmSales.length === 0) return flatRows;

  // Determine which dimensions participate in CRM matching
  const matchDims = dimensions.filter(d => CRM_MATCH_FIELDS[d]);
  if (matchDims.length === 0) return flatRows;

  // Group CRM sales by matching key
  const crmGroups = new Map<string, SaleRow[]>();
  for (const sale of crmSales) {
    const keyParts: string[] = [];
    for (const dim of matchDims) {
      keyParts.push(CRM_MATCH_FIELDS[dim](sale));
    }
    const key = keyParts.join('::');
    let group = crmGroups.get(key);
    if (!group) {
      group = [];
      crmGroups.set(key, group);
    }
    group.push(sale);
  }

  // Compute CRM metrics per group
  const crmMetricsMap = new Map<string, CrmMetrics>();
  for (const [key, group] of crmGroups) {
    crmMetricsMap.set(key, computeCrmMetrics(group));
  }

  // Check if classification dimensions might cause duplicate tracking keys
  const hasClassificationDims = dimensions.some(d => d === 'classifiedProduct' || d === 'classifiedCountry');

  if (!hasClassificationDims) {
    // Simple case: 1:1 match between marketing rows and CRM groups
    return flatRows.map(row => {
      const keyParts: string[] = [];
      for (const dim of matchDims) {
        const field = MARKETING_MATCH_FIELDS[dim];
        let val = String(row[field] ?? '');
        if (dim === 'date') val = marketingDateToCrmDate(val);
        keyParts.push(val);
      }
      const key = keyParts.join('::');
      const crm = crmMetricsMap.get(key) ?? EMPTY_CRM;
      return { ...row, ...prefixCrm(crm) };
    });
  }

  // Classification dimensions present: distribute CRM proportionally by impressions
  // First compute total impressions per tracking key
  const impressionsByKey = new Map<string, number>();
  for (const row of flatRows) {
    const key = buildMarketingMatchKey(row, matchDims);
    impressionsByKey.set(key, (impressionsByKey.get(key) ?? 0) + (Number(row.impressions) || 0));
  }

  return flatRows.map(row => {
    const key = buildMarketingMatchKey(row, matchDims);
    const crm = crmMetricsMap.get(key);
    if (!crm) return { ...row, ...prefixCrm(EMPTY_CRM) };

    const totalImpr = impressionsByKey.get(key) ?? 1;
    const rowImpr = Number(row.impressions) || 0;
    const proportion = totalImpr > 0 ? rowImpr / totalImpr : 0;

    return {
      ...row,
      ...prefixCrm({
        customers: crm.customers * proportion,
        upsellNewCustomers: crm.upsellNewCustomers * proportion,
        subscriptions: crm.subscriptions * proportion,
        upsellSubs: crm.upsellSubs * proportion,
        upsellSubTrials: crm.upsellSubTrials * proportion,
        trials: crm.trials * proportion,
        trialsApproved: crm.trialsApproved * proportion,
        onHold: crm.onHold * proportion,
        ots: crm.ots * proportion,
        otsApproved: crm.otsApproved * proportion,
        upsells: crm.upsells * proportion,
        upsellsApproved: crm.upsellsApproved * proportion,
        upsellsDeleted: crm.upsellsDeleted * proportion,
      }),
    };
  });
}

function buildMarketingMatchKey(row: MarketingFlatRow, matchDims: string[]): string {
  const parts: string[] = [];
  for (const dim of matchDims) {
    const field = MARKETING_MATCH_FIELDS[dim];
    let val = String(row[field] ?? '');
    if (dim === 'date') val = marketingDateToCrmDate(val);
    parts.push(val);
  }
  return parts.join('::');
}

/** Prefix CRM metrics with _crm for flat row storage */
function prefixCrm(crm: CrmMetrics): Record<string, number> {
  return {
    _crm_customers: crm.customers,
    _crm_upsellNewCustomers: crm.upsellNewCustomers,
    _crm_subscriptions: crm.subscriptions,
    _crm_upsellSubs: crm.upsellSubs,
    _crm_upsellSubTrials: crm.upsellSubTrials,
    _crm_trials: crm.trials,
    _crm_trialsApproved: crm.trialsApproved,
    _crm_onHold: crm.onHold,
    _crm_ots: crm.ots,
    _crm_otsApproved: crm.otsApproved,
    _crm_upsells: crm.upsells,
    _crm_upsellsApproved: crm.upsellsApproved,
    _crm_upsellsDeleted: crm.upsellsDeleted,
  };
}

// ─── Tree building ───────────────────────────────────────────────────────────

/**
 * Build a hierarchical tree from flat marketing data rows.
 *
 * Groups rows by dimensions at each level, sums base metrics + CRM metrics,
 * and computes derived metrics from the correct aggregated sums.
 */
export function buildMarketingTree(
  flatRows: MarketingFlatRow[],
  dimensions: string[],
  sortBy: string | null,
  sortDirection: 'ascend' | 'descend' | null,
): ReportRow[] {
  if (flatRows.length === 0 || dimensions.length === 0) return [];
  return buildLevel(
    flatRows,
    dimensions,
    0,
    '',
    sortBy ?? 'clicks',
    sortDirection ?? 'descend',
  );
}

function buildLevel(
  rows: MarketingFlatRow[],
  dimensions: string[],
  depth: number,
  keyPrefix: string,
  sortBy: string,
  sortDirection: 'ascend' | 'descend',
): ReportRow[] {
  if (depth >= dimensions.length || rows.length === 0) return [];

  const dim = dimensions[depth];
  const isLast = depth === dimensions.length - 1;

  // Group rows by the current dimension value
  const groups = new Map<string, MarketingFlatRow[]>();
  for (const row of rows) {
    const val = String(row[dim] ?? 'Unknown');
    let group = groups.get(val);
    if (!group) {
      group = [];
      groups.set(val, group);
    }
    group.push(row);
  }

  // Build a ReportRow per group
  const result: ReportRow[] = [];
  for (const [dimValue, groupRows] of groups) {
    const key = keyPrefix ? keyPrefix + '::' + dimValue : dimValue;

    // Sum base metrics across all rows in this group
    let cost = 0;
    let clicks = 0;
    let impressions = 0;
    let conversions = 0;
    // CRM base metrics
    let customers = 0;
    let upsellNewCustomers = 0;
    let subscriptions = 0;
    let upsellSubs = 0;
    let upsellSubTrials = 0;
    let trials = 0;
    let trialsApproved = 0;
    let onHold = 0;
    let ots = 0;
    let otsApproved = 0;
    let upsells = 0;
    let upsellsApproved = 0;
    let upsellsDeleted = 0;

    for (const r of groupRows) {
      cost += Number(r.cost) || 0;
      clicks += Number(r.clicks) || 0;
      impressions += Number(r.impressions) || 0;
      conversions += Number(r.conversions) || 0;
      // CRM
      customers += Number(r._crm_customers) || 0;
      upsellNewCustomers += Number(r._crm_upsellNewCustomers) || 0;
      subscriptions += Number(r._crm_subscriptions) || 0;
      upsellSubs += Number(r._crm_upsellSubs) || 0;
      upsellSubTrials += Number(r._crm_upsellSubTrials) || 0;
      trials += Number(r._crm_trials) || 0;
      trialsApproved += Number(r._crm_trialsApproved) || 0;
      onHold += Number(r._crm_onHold) || 0;
      ots += Number(r._crm_ots) || 0;
      otsApproved += Number(r._crm_otsApproved) || 0;
      upsells += Number(r._crm_upsells) || 0;
      upsellsApproved += Number(r._crm_upsellsApproved) || 0;
      upsellsDeleted += Number(r._crm_upsellsDeleted) || 0;
    }

    const row: ReportRow = {
      key,
      attribute: formatAttribute(dim, dimValue),
      depth,
      hasChildren: !isLast,
      metrics: {
        cost,
        clicks,
        impressions,
        conversions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        cpc: clicks > 0 ? cost / clicks : 0,
        cpm: impressions > 0 ? (cost / impressions) * 1000 : 0,
        conversionRate: impressions > 0 ? conversions / impressions : 0,
        // CRM
        customers: Math.round(customers),
        upsellNewCustomers: Math.round(upsellNewCustomers),
        subscriptions: Math.round(subscriptions),
        upsellSubs: Math.round(upsellSubs),
        upsellSubTrials: Math.round(upsellSubTrials),
        trials: Math.round(trials),
        trialsApproved: Math.round(trialsApproved),
        approvalRate: subscriptions > 0 ? trialsApproved / subscriptions : 0,
        realCpa: trials > 0 ? Math.round(cost / trials) : 0,
        onHold: Math.round(onHold),
        ots: Math.round(ots),
        otsApproved: Math.round(otsApproved),
        otsApprovalRate: ots > 0 ? otsApproved / ots : 0,
        upsells: Math.round(upsells),
        upsellsApproved: Math.round(upsellsApproved),
        upsellsDeleted: Math.round(upsellsDeleted),
        upsellApprovalRate: upsells > 0 ? upsellsApproved / upsells : 0,
      },
    };

    if (!isLast) {
      row.children = buildLevel(groupRows, dimensions, depth + 1, key, sortBy, sortDirection);
    }

    result.push(row);
  }

  return sortRows(result, sortBy, sortDirection, dim);
}

/** Format a dimension value for display */
function formatAttribute(dimension: string, value: string): string {
  if (dimension === 'classifiedCountry') return value.toUpperCase();
  if (dimension === 'date') return value;
  return toTitleCase(value);
}

/** Sort rows — date dimension always sorts chronologically DESC, others by metric */
function sortRows(
  rows: ReportRow[],
  sortBy: string,
  direction: 'ascend' | 'descend',
  dimension: string,
): ReportRow[] {
  if (dimension === 'date') {
    return rows.sort((a, b) => parseDateValue(b.attribute) - parseDateValue(a.attribute));
  }

  const multiplier = direction === 'ascend' ? 1 : -1;
  return rows.sort((a, b) => {
    const aVal = a.metrics[sortBy as keyof typeof a.metrics];
    const bVal = b.metrics[sortBy as keyof typeof b.metrics];
    const aNum = typeof aVal === 'number' ? aVal : 0;
    const bNum = typeof bVal === 'number' ? bVal : 0;
    return (aNum - bNum) * multiplier;
  });
}

/** Parse dd/mm/yyyy to a sortable timestamp */
function parseDateValue(dateStr: string): number {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
  }
  return 0;
}

// ─── CRM detail modal filtering ──────────────────────────────────────────────

/**
 * Filter CRM sales to match a specific marketing row's dimensions.
 *
 * Uses flat marketing data to resolve dimension values (campaign name → tracking_id_4, etc.)
 * then filters CRM sales by the resolved tracking keys.
 */
export function filterCrmForMarketingRow(
  crmSales: SaleRow[],
  dimensionFilters: Record<string, string>,
  flatData: MarketingFlatRow[],
  dimensions: string[],
): SaleRow[] {
  if (crmSales.length === 0) return [];

  // Find flat marketing rows that match ALL dimension filter values
  const matchingFlat = flatData.filter(row => {
    for (const [dim, value] of Object.entries(dimensionFilters)) {
      if (String(row[dim] ?? '') !== value) return false;
    }
    return true;
  });

  if (matchingFlat.length === 0) return [];

  // Determine which dimensions participate in CRM matching
  const matchDims = dimensions.filter(d => d in CRM_MATCH_FIELDS);
  if (matchDims.length === 0) return crmSales;

  // Build set of CRM matching keys from the matched flat rows
  const matchKeys = new Set<string>();
  for (const row of matchingFlat) {
    const parts: string[] = [];
    for (const dim of matchDims) {
      const field = MARKETING_MATCH_FIELDS[dim];
      let val = String(row[field] ?? '');
      if (dim === 'date') val = marketingDateToCrmDate(val);
      parts.push(val);
    }
    matchKeys.add(parts.join('::'));
  }

  // Filter CRM sales by matching keys
  return crmSales.filter(sale => {
    const parts: string[] = [];
    for (const dim of matchDims) {
      parts.push(CRM_MATCH_FIELDS[dim](sale));
    }
    return matchKeys.has(parts.join('::'));
  });
}
