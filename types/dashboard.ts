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
    upsells: number;          // COUNT of upsells where upsell_type = 'ots'
  };
}

/**
 * Date range for filtering orders
 */
export interface DateRange {
  start: Date;
  end: Date;
}
