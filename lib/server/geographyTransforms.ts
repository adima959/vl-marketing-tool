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
 * Build a lookup map from the standalone trial query rows.
 * Overrides the main query's trial_count / trials_approved_count.
 */
export function buildTrialMap(
  trialRows: Array<Record<string, any>>,
  columnName: string,
  keyPrefix: string
): Map<string, { trials: number; trialsApproved: number; onHold: number }> {
  const map = new Map<string, { trials: number; trialsApproved: number; onHold: number }>();

  for (const row of trialRows) {
    const rawValue = row[columnName] || 'Unknown';
    const displayValue = toTitleCase(rawValue);
    const key = `${keyPrefix}${displayValue}`;

    map.set(key, {
      trials: Number(row.trial_count) || 0,
      trialsApproved: Number(row.trials_approved_count) || 0,
      onHold: Number(row.on_hold_count) || 0,
    });
  }

  return map;
}

/**
 * Transform a single subscription DB row into a DashboardRow, merging OTS and trial data.
 * Returns both the row and the otsKey for match tracking.
 */
export function transformDashboardRow(
  row: Record<string, any>,
  otsMap: Map<string, { ots: number; otsApproved: number }>,
  trialMap: Map<string, { trials: number; trialsApproved: number; onHold: number }>,
  columnName: string,
  keyPrefix: string,
  depth: number,
  hasMoreDimensions: boolean
): { dashboardRow: DashboardRow; otsKey: string } {
  const rawValue = row[columnName] || 'Unknown';
  const displayValue = toTitleCase(rawValue);
  const rowKey = `${keyPrefix}${displayValue}`;

  const subscriptions = Number(row.subscription_count) || 0;
  const upsells = Number(row.upsell_count) || 0;
  const upsellSub = Number(row.upsell_sub_count) || 0;
  const upsellOts = Number(row.upsell_ots_count) || 0;
  const upsellsApproved = Number(row.upsells_approved_count) || 0;

  const otsData = otsMap.get(rowKey) || { ots: 0, otsApproved: 0 };

  // Trial data from standalone query overrides main query's trial counts
  const trialData = trialMap.get(rowKey);
  const trials = trialData ? trialData.trials : (Number(row.trial_count) || 0);
  const trialsApproved = trialData ? trialData.trialsApproved : (Number(row.trials_approved_count) || 0);
  const onHold = trialData ? trialData.onHold : 0;

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
        onHold,
        approvalRate: subscriptions > 0 ? trialsApproved / subscriptions : 0,
        otsApprovalRate: otsData.ots > 0 ? otsData.otsApproved / otsData.ots : 0,
        upsells,
        upsellSub,
        upsellOts,
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
          onHold: 0,
          approvalRate,
          otsApprovalRate: approvalRate,
          upsells: 0,
          upsellSub: 0,
          upsellOts: 0,
          upsellsApproved: 0,
          upsellApprovalRate: 0,
        },
      });
    }
  }

  return rows;
}
