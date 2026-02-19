/**
 * Metric-specific SaleRow filters for the detail modal.
 *
 * Each filter mirrors the counting logic in computeMetrics() (salesAggregation.ts)
 * so the modal record count always matches the table cell value.
 */

import type { SaleRow, SalesDimension } from '@/types/sales';
import { DIMENSION_TO_FIELD } from '@/types/sales';

export type ClickableMetricId =
  | 'customers'
  | 'subscriptions'
  | 'trials'
  | 'trialsApproved'
  | 'onHold'
  | 'ots'
  | 'upsellsApproved';

export const CLICKABLE_METRIC_IDS: ClickableMetricId[] = [
  'customers', 'subscriptions', 'trials', 'trialsApproved', 'onHold', 'ots', 'upsellsApproved',
];

/** Apply dimension filters (country, productGroup, etc.) to SaleRow[] */
function applyDimensionFilters(
  rows: SaleRow[],
  dimensionFilters: Record<string, string>,
): SaleRow[] {
  let filtered = rows;
  for (const [dimId, value] of Object.entries(dimensionFilters)) {
    const field = DIMENSION_TO_FIELD[dimId as SalesDimension];
    if (field) {
      filtered = filtered.filter((r) => String(r[field]) === value);
    }
  }
  return filtered;
}

/** Metric-specific row predicates — mirrors computeMetrics() */
const METRIC_PREDICATES: Record<ClickableMetricId, (r: SaleRow) => boolean> = {
  customers: (r) => r.type === 'subscription' && !r.is_upsell_sub && r.is_new_customer,
  subscriptions: (r) => r.type === 'subscription' && !r.is_upsell_sub,
  trials: (r) => r.type === 'subscription' && !r.is_upsell_sub && r.has_trial,
  trialsApproved: (r) => r.type === 'subscription' && !r.is_upsell_sub && r.is_approved,
  onHold: (r) => r.type === 'subscription' && !r.is_upsell_sub && r.is_on_hold,
  ots: (r) => r.type === 'ots',
  upsellsApproved: (r) => r.type === 'upsell' && r.is_approved && !r.is_deleted,
};

/**
 * Filter salesData by dimension values + metric criteria.
 *
 * For 'customers' metric, deduplicates by customer_id since the table
 * shows COUNT(DISTINCT customer_id).
 */
export function filterSalesForMetric(
  salesData: SaleRow[],
  dimensionFilters: Record<string, string>,
  metricId: ClickableMetricId,
): SaleRow[] {
  const dimFiltered = applyDimensionFilters(salesData, dimensionFilters);
  const predicate = METRIC_PREDICATES[metricId];
  const metricFiltered = dimFiltered.filter(predicate);

  if (metricId === 'customers') {
    const seen = new Set<number>();
    return metricFiltered.filter((r) => {
      if (seen.has(r.customer_id)) return false;
      seen.add(r.customer_id);
      return true;
    });
  }

  return metricFiltered;
}
