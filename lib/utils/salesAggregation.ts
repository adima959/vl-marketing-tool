/**
 * Client-side aggregation of flat SaleRow data into hierarchical dashboard rows.
 *
 * Replaces the old server-side GROUP BY approach.
 * All data is in memory — expanding rows is instant with no API calls.
 */

import type { SaleRow, SalesDimension, DashboardRow, DailyAggregate } from '@/types/sales';
import { DIMENSION_TO_FIELD } from '@/types/sales';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupBy(rows: SaleRow[], field: keyof SaleRow): Map<string, SaleRow[]> {
  const map = new Map<string, SaleRow[]>();
  for (const row of rows) {
    const key = String(row[field] ?? '');
    const arr = map.get(key);
    if (arr) arr.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function computeMetrics(rows: SaleRow[]): DashboardRow['metrics'] {
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
  let total = 0;

  const newCustomerIds = new Set<number>();
  const upsellNewCustomerIds = new Set<number>();

  for (const row of rows) {
    total += row.total;

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
  // Upsell-only new customers: new customers whose only sub in this group is an upsell
  const upsellNewCustomers = [...upsellNewCustomerIds].filter((id) => !newCustomerIds.has(id)).length;

  return {
    customers,
    upsellNewCustomers,
    subscriptions,
    upsellSubs,
    upsellSubTrials,
    trials,
    trialsApproved,
    approvalRate: subscriptions > 0 ? trialsApproved / subscriptions : 0,
    onHold,
    ots,
    otsApproved,
    otsApprovalRate: ots > 0 ? otsApproved / ots : 0,
    upsells,
    upsellsApproved,
    upsellsDeleted,
    upsellApprovalRate: upsells > 0 ? upsellsApproved / upsells : 0,
    total,
  };
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

type SortDirection = 'ascend' | 'descend';

function sortRows(
  rows: DashboardRow[],
  sortColumn: string | null,
  sortDirection: SortDirection | null,
): DashboardRow[] {
  if (!sortColumn || !sortDirection) return rows;

  const multiplier = sortDirection === 'ascend' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const aVal = a.metrics[sortColumn as keyof DashboardRow['metrics']] ?? 0;
    const bVal = b.metrics[sortColumn as keyof DashboardRow['metrics']] ?? 0;
    return (Number(aVal) - Number(bVal)) * multiplier;
  });
}

function sortTree(
  rows: DashboardRow[],
  sortColumn: string | null,
  sortDirection: SortDirection | null,
): DashboardRow[] {
  const sorted = sortRows(rows, sortColumn, sortDirection);
  return sorted.map((row) => {
    if (row.children && row.children.length > 0) {
      return { ...row, children: sortTree(row.children, sortColumn, sortDirection) };
    }
    return row;
  });
}

// ---------------------------------------------------------------------------
// Tree aggregation
// ---------------------------------------------------------------------------

function buildTree(
  rows: SaleRow[],
  dimensions: SalesDimension[],
  depth: number,
  keyPrefix: string,
): DashboardRow[] {
  if (dimensions.length === 0) return [];

  const [currentDim, ...remainingDims] = dimensions;
  const field = DIMENSION_TO_FIELD[currentDim];
  const groups = groupBy(rows, field);
  const hasChildren = remainingDims.length > 0;

  const result: DashboardRow[] = [];

  for (const [value, groupRows] of groups) {
    const key = keyPrefix ? `${keyPrefix}::${value}` : value;
    const metrics = computeMetrics(groupRows);
    const children = hasChildren ? buildTree(groupRows, remainingDims, depth + 1, key) : undefined;

    result.push({
      key,
      attribute: value,
      depth,
      hasChildren,
      children,
      metrics,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Aggregate flat SaleRow[] into a hierarchical DashboardRow[] tree.
 *
 * - Grouping follows the dimension order (e.g., country → productGroup → product)
 * - All children are pre-computed (expanding rows is instant, no API call)
 * - Sorting is applied to every level of the tree
 */
export function aggregateSales(
  rows: SaleRow[],
  dimensions: SalesDimension[],
  sortColumn: string | null,
  sortDirection: SortDirection | null,
): DashboardRow[] {
  if (rows.length === 0 || dimensions.length === 0) return [];
  const tree = buildTree(rows, dimensions, 0, '');
  return sortTree(tree, sortColumn, sortDirection);
}

/**
 * Aggregate flat SaleRow[] by date for the time series chart.
 * Returns one entry per unique date, sorted chronologically.
 */
export function aggregateByDate(rows: SaleRow[]): DailyAggregate[] {
  const map = new Map<string, SaleRow[]>();

  for (const row of rows) {
    const arr = map.get(row.date);
    if (arr) arr.push(row);
    else map.set(row.date, [row]);
  }

  const result: DailyAggregate[] = [];

  for (const [date, groupRows] of map) {
    const m = computeMetrics(groupRows);
    result.push({
      date,
      customers: m.customers,
      subscriptions: m.subscriptions,
      trialsApproved: m.trialsApproved,
      onHold: m.onHold,
      approvalRate: m.approvalRate,
      upsells: m.upsells,
      ots: m.ots,
    });
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}
