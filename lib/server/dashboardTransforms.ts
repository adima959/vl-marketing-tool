import type { DashboardRow } from '@/types/dashboard';
import { toTitleCase } from '@/lib/formatters';

/**
 * Build a lookup map from OTS query rows, keyed by toTitleCase display value.
 * Pure function — no side effects.
 */
export function buildOtsMap(
  otsRows: Array<Record<string, any>>,
  columnName: string,
  keyPrefix: string
): Map<string, { ots: number; otsApproved: number }> {
  const map = new Map<string, { ots: number; otsApproved: number }>();

  for (const otsRow of otsRows) {
    const rawValue = otsRow[columnName] || 'Unknown';
    const displayValue = toTitleCase(rawValue);
    const key = `${keyPrefix}${displayValue}`;

    map.set(key, {
      ots: Number(otsRow.ots_count) || 0,
      otsApproved: Number(otsRow.ots_approved_count) || 0,
    });
  }

  return map;
}

/**
 * Transform a single subscription DB row into a DashboardRow, merging OTS data.
 * Returns both the row and the otsKey for match tracking.
 */
export function transformDashboardRow(
  row: Record<string, any>,
  otsMap: Map<string, { ots: number; otsApproved: number }>,
  columnName: string,
  keyPrefix: string,
  depth: number,
  hasMoreDimensions: boolean
): { dashboardRow: DashboardRow; otsKey: string } {
  const rawValue = row[columnName] || 'Unknown';
  const displayValue = toTitleCase(rawValue);
  const rowKey = `${keyPrefix}${displayValue}`;

  const trials = Number(row.trial_count) || 0;
  const trialsApproved = Number(row.trials_approved_count) || 0;
  const subscriptions = Number(row.subscription_count) || 0;
  const upsells = Number(row.upsell_count) || 0;
  const upsellsApproved = Number(row.upsells_approved_count) || 0;

  const otsData = otsMap.get(rowKey) || { ots: 0, otsApproved: 0 };

  return {
    dashboardRow: {
      key: rowKey,
      attribute: displayValue,
      depth,
      hasChildren: hasMoreDimensions,
      metrics: {
        customers: Number(row.customer_count) || 0,
        subscriptions,
        trials,
        ots: otsData.ots,
        otsApproved: otsData.otsApproved,
        trialsApproved,
        approvalRate: subscriptions > 0 ? trialsApproved / subscriptions : 0,
        otsApprovalRate: otsData.ots > 0 ? otsData.otsApproved / otsData.ots : 0,
        upsells,
        upsellsApproved,
        upsellApprovalRate: upsells > 0 ? upsellsApproved / upsells : 0,
      },
    },
    otsKey: rowKey,
  };
}

/**
 * Build DashboardRows for OTS entries that had no matching subscription row.
 * All subscription metrics are zero; approvalRate uses otsApproved/ots.
 */
export function buildOtsOnlyRows(
  otsMap: Map<string, { ots: number; otsApproved: number }>,
  matchedOtsKeys: Set<string>,
  keyPrefix: string,
  depth: number,
  hasMoreDimensions: boolean
): DashboardRow[] {
  const rows: DashboardRow[] = [];

  for (const [otsKey, otsData] of otsMap.entries()) {
    if (!matchedOtsKeys.has(otsKey)) {
      const attribute = otsKey.replace(keyPrefix, '');
      const approvalRate = otsData.ots > 0 ? otsData.otsApproved / otsData.ots : 0;

      rows.push({
        key: otsKey,
        attribute,
        depth,
        hasChildren: hasMoreDimensions,
        metrics: {
          customers: 0,
          subscriptions: 0,
          trials: 0,
          ots: otsData.ots,
          otsApproved: otsData.otsApproved,
          trialsApproved: 0,
          approvalRate,
          otsApprovalRate: approvalRate,
          upsells: 0,
          upsellsApproved: 0,
          upsellApprovalRate: 0,
        },
      });
    }
  }

  return rows;
}
