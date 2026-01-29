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
    subscriptions: number;    // COUNT of subscription IDs
    ots: number;              // COUNT of upsells where upsell_type = 'ots'
    trials: number;           // COUNT of trial_order_id
    customers: number;        // COUNT DISTINCT customer_id
  };
}

/**
 * Date range for filtering orders
 */
export interface DateRange {
  start: Date;
  end: Date;
}
