import type { BaseTableRow } from './table';
import type { CrmMetrics } from './crm';

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
  metrics: CrmMetrics & {
    upsellSub: number;        // COUNT of subscription-type upsells (uo.type = 1)
    upsellOts: number;        // COUNT of OTS-type upsells (uo.type = 3)
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
  ots: number;
  otsApproved: number;
  trialsApproved: number;
  onHold: number;
  customers: number;
  upsells: number;
  upsellSub: number;
  upsellOts: number;
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
