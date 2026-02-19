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

/** Add scaled CRM metrics from source into target accumulator */
function addScaledCrm(target: CrmMetrics, source: CrmMetrics, proportion: number): void {
  target.customers += source.customers * proportion;
  target.upsellNewCustomers += source.upsellNewCustomers * proportion;
  target.subscriptions += source.subscriptions * proportion;
  target.upsellSubs += source.upsellSubs * proportion;
  target.upsellSubTrials += source.upsellSubTrials * proportion;
  target.trials += source.trials * proportion;
  target.trialsApproved += source.trialsApproved * proportion;
  target.onHold += source.onHold * proportion;
  target.ots += source.ots * proportion;
  target.otsApproved += source.otsApproved * proportion;
  target.upsells += source.upsells * proportion;
  target.upsellsApproved += source.upsellsApproved * proportion;
  target.upsellsDeleted += source.upsellsDeleted * proportion;
}

/** Group CRM sales by a key built from the given dimensions */
function groupCrmSales(sales: SaleRow[], dims: string[]): Map<string, SaleRow[]> {
  const groups = new Map<string, SaleRow[]>();
  for (const sale of sales) {
    const parts: string[] = [];
    for (const dim of dims) parts.push(CRM_MATCH_FIELDS[dim](sale));
    const key = parts.join('::');
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(sale);
  }
  return groups;
}

/**
 * Attach CRM metrics to each marketing flat row by matching on ad tracking dimensions.
 *
 * 1. Determines which dimensions can be matched (network, campaign, adset, ad, date)
 * 2. Groups CRM sales by those matching dimensions
 * 3. For each marketing row, looks up the matching CRM group
 * 4. If classification dims cause multiple rows with the same tracking key,
 *    distributes CRM metrics proportionally by impressions
 * 5. Unmatched CRM sales fall back to progressively shorter keys (e.g. network::campaign
 *    then network) and are distributed proportionally by impressions at that level
 */
export function attachCrmMetrics(
  flatRows: MarketingFlatRow[],
  crmSales: SaleRow[],
  dimensions: string[],
): MarketingFlatRow[] {
  if (crmSales.length === 0) return flatRows;

  const matchDims = dimensions.filter(d => CRM_MATCH_FIELDS[d]);
  if (matchDims.length === 0) return flatRows;

  // Per-row CRM accumulator
  const accum: CrmMetrics[] = flatRows.map(() => ({
    customers: 0, upsellNewCustomers: 0, subscriptions: 0, upsellSubs: 0,
    upsellSubTrials: 0, trials: 0, trialsApproved: 0, onHold: 0,
    ots: 0, otsApproved: 0, upsells: 0, upsellsApproved: 0, upsellsDeleted: 0,
  }));

  // Precompute each marketing row's full match key
  const marketingKeys: string[] = flatRows.map(row => buildMarketingMatchKey(row, matchDims));
  const marketingKeySet = new Set(marketingKeys);

  // Group CRM sales by full match key
  const crmGroups = groupCrmSales(crmSales, matchDims);

  const hasClassificationDims = dimensions.some(
    d => d === 'classifiedProduct' || d === 'classifiedCountry',
  );

  // ── Phase 1: Exact match ─────────────────────────────────────────────────
  // Build impressions-by-key for proportional distribution
  const impressionsByKey = new Map<string, number>();
  for (let i = 0; i < flatRows.length; i++) {
    const key = marketingKeys[i];
    impressionsByKey.set(key, (impressionsByKey.get(key) ?? 0) + (Number(flatRows[i].impressions) || 0));
  }

  const matchedCrmKeys = new Set<string>();

  for (let i = 0; i < flatRows.length; i++) {
    const key = marketingKeys[i];
    const crmGroup = crmGroups.get(key);
    if (!crmGroup) continue;

    matchedCrmKeys.add(key);
    const crm = computeCrmMetrics(crmGroup);

    if (hasClassificationDims) {
      const totalImpr = impressionsByKey.get(key) ?? 1;
      const rowImpr = Number(flatRows[i].impressions) || 0;
      const proportion = totalImpr > 0 ? rowImpr / totalImpr : 0;
      addScaledCrm(accum[i], crm, proportion);
    } else {
      addScaledCrm(accum[i], crm, 1);
    }
  }

  // ── Phase 2: Fallback for unmatched CRM ──────────────────────────────────
  // Collect CRM sales whose full key didn't match any marketing row
  let unmatchedSales: SaleRow[] = [];
  for (const [key, sales] of crmGroups) {
    if (!matchedCrmKeys.has(key)) unmatchedSales.push(...sales);
  }

  // Try progressively shorter keys (remove rightmost match dim each round)
  for (let level = matchDims.length - 1; level >= 1 && unmatchedSales.length > 0; level--) {
    const fallbackDims = matchDims.slice(0, level);

    // Build marketing impressions by fallback key
    const fbImprByKey = new Map<string, number>();
    const fbRowsByKey = new Map<string, number[]>();
    for (let i = 0; i < flatRows.length; i++) {
      const fbKey = buildMarketingMatchKey(flatRows[i], fallbackDims);
      fbImprByKey.set(fbKey, (fbImprByKey.get(fbKey) ?? 0) + (Number(flatRows[i].impressions) || 0));
      let indices = fbRowsByKey.get(fbKey);
      if (!indices) {
        indices = [];
        fbRowsByKey.set(fbKey, indices);
      }
      indices.push(i);
    }

    // Group unmatched CRM by fallback key
    const fbCrmGroups = groupCrmSales(unmatchedSales, fallbackDims);

    const stillUnmatched: SaleRow[] = [];
    for (const [fbKey, sales] of fbCrmGroups) {
      const rowIndices = fbRowsByKey.get(fbKey);
      if (!rowIndices) {
        stillUnmatched.push(...sales);
        continue;
      }
      // Distribute proportionally by impressions
      const crm = computeCrmMetrics(sales);
      const totalImpr = fbImprByKey.get(fbKey) ?? 0;
      for (const idx of rowIndices) {
        const rowImpr = Number(flatRows[idx].impressions) || 0;
        const proportion = totalImpr > 0 ? rowImpr / totalImpr : 0;
        addScaledCrm(accum[idx], crm, proportion);
      }
    }
    unmatchedSales = stillUnmatched;
  }

  // ── Apply accumulated CRM to flat rows ───────────────────────────────────
  return flatRows.map((row, i) => ({ ...row, ...prefixCrm(accum[i]) }));
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
