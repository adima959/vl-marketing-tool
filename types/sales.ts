/**
 * Flat sales table — one row per sale event.
 *
 * Three types of sales:
 * - subscription: Non-upsell subscription (date = s.date_create)
 * - ots: One-time sale / type-3 invoice (date = i.order_date)
 * - upsell: Invoice tagged with parent-sub-id (date = parent sub's date_create)
 *
 * All dashboard metrics are derived from this flat data via frontend aggregation.
 */
export interface SaleRow {
  id: number;
  type: 'subscription' | 'ots' | 'upsell';
  parent_subscription_id: number | null;
  date: string;
  customer_id: number;
  customer_name: string;
  is_new_customer: boolean;
  country: string;
  product_group: string;
  product: string;
  sku: string;
  source: string;
  tracking_id: string | null;
  tracking_id_2: string | null;
  tracking_id_3: string | null;
  tracking_id_4: string | null;
  tracking_id_5: string | null;
  total: number;
  has_trial: boolean;
  is_approved: boolean;
  is_on_hold: boolean;
  is_deleted: boolean;
  is_upsell_sub: boolean;
  status: string | null;
  cancel_reason: string | null;
}

/** Dimension IDs available for hierarchical grouping */
export type SalesDimension = 'country' | 'productGroup' | 'product' | 'source';

export const SALES_DIMENSIONS: { id: SalesDimension; label: string }[] = [
  { id: 'country', label: 'Country' },
  { id: 'productGroup', label: 'Product Name' },
  { id: 'product', label: 'Product' },
  { id: 'source', label: 'Source' },
];

/** Maps dimension ID to the SaleRow field used for grouping */
export const DIMENSION_TO_FIELD: Record<SalesDimension, keyof SaleRow> = {
  country: 'country',
  productGroup: 'product_group',
  product: 'product',
  source: 'source',
};

/** Aggregated dashboard row used by table and detail modal */
export interface DashboardRow {
  key: string;
  attribute: string;
  depth: number;
  hasChildren: boolean;
  children?: DashboardRow[];
  metrics: {
    customers: number;
    upsellNewCustomers: number;
    subscriptions: number;
    upsellSubs: number;
    upsellSubTrials: number;
    trials: number;
    trialsApproved: number;
    approvalRate: number;
    onHold: number;
    ots: number;
    otsApproved: number;
    otsApprovalRate: number;
    upsells: number;
    upsellsApproved: number;
    upsellsDeleted: number;
    upsellApprovalRate: number;
    total: number;
  };
}

/** Daily aggregate for time series chart */
export interface DailyAggregate {
  date: string;
  customers: number;
  subscriptions: number;
  trialsApproved: number;
  onHold: number;
  approvalRate: number;
  upsells: number;
  ots: number;
}
