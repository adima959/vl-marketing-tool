import type { BaseTableRow } from './table';

/**
 * Dashboard row structure for hierarchical table
 * Extends BaseTableRow for use with GenericDataTable
 */
export interface DashboardRow extends BaseTableRow {
  key: string;          // Format: "DENMARK" or "DENMARK::T-Formula" or "DENMARK::T-Formula::4235"
  attribute: string;    // Display text for the row
  depth: number;        // 0 = country, 1 = product, 2 = individual order
  hasChildren?: boolean;
  children?: DashboardRow[];
  metrics: {
    customers: number;        // COUNT DISTINCT new customers (registration date = subscription date)
    subscriptions: number;    // COUNT of subscription IDs
    trials: number;           // COUNT of trial_order_id
    trialsApproved: number;   // COUNT of approved trials (is_marked = 1)
    approvalRate: number;     // trialsApproved / trials (decimal ratio for formatPercentage)
    upsells: number;          // COUNT of upsells where upsell_type = 'ots'
    upsellsApproved: number;  // COUNT of approved upsells (is_marked = 1)
    upsellApprovalRate: number; // upsellsApproved / upsells (decimal ratio for formatPercentage)
  };
}

/**
 * Date range for filtering orders
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Time series data point for dashboard chart
 * Each point represents aggregated metrics for a single day
 */
export interface TimeSeriesDataPoint {
  date: string;           // Format: 'YYYY-MM-DD'
  subscriptions: number;
  trials: number;
  trialsApproved: number;
  customers: number;
  upsells: number;
  upsellsApproved: number;
}

/**
 * API response for time series data
 */
export interface TimeSeriesResponse {
  success: boolean;
  data: TimeSeriesDataPoint[];
  error?: string;
}
