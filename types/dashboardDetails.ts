import type { DateRange } from '@/types/dashboard';

/**
 * Context passed when a metric cell is clicked
 * Contains all information needed to query for detail records
 */
export interface MetricClickContext {
  metricId: 'customers' | 'subscriptions' | 'trials' | 'trialsApproved' | 'ots' | 'upsells';
  metricLabel: string;       // Human-readable name for modal title
  value: number;             // Aggregated count that was clicked
  filters: {
    dateRange: DateRange;
    country?: string;        // Depth 0 filter (always present if depth >= 0)
    productName?: string;    // Product group name filter (e.g., "FlexRepair")
    product?: string;        // Full product name filter (e.g., "Flex_Repair-DNK-x3-[166/996]")
    source?: string;         // Source filter (present at deepest depth)
    excludeDeleted?: boolean;     // If true, exclude deleted subscriptions (s.deleted = 0)
    excludeUpsellTags?: boolean;  // If true, exclude upsell invoices (i.tag NOT LIKE '%parent-sub-id=%')
    rateType?: 'approval' | 'pay' | 'buy';  // Rate type for validation rate pages (affects query logic)
  };
}

/**
 * Individual record shown in modal
 * Consistent structure for all metric types (as per user preference)
 */
export interface DetailRecord {
  id: string;                    // Unique identifier (subscription_id or invoice_id)
  customerName: string;          // customer.customer_name
  customerEmail: string;         // customer.email
  customerId: number;            // customer.id
  source: string;                // source.source
  trackingId1: string | null;    // Tracking IDs 1-5
  trackingId2: string | null;
  trackingId3: string | null;
  trackingId4: string | null;
  trackingId5: string | null;
  amount: number;                // Subscription/invoice amount (price)
  date: string;                  // Record date (ISO string)

  // Additional context fields for display
  subscriptionId?: number;
  invoiceId?: number;
  productName?: string;
  country?: string;
  isApproved?: number;          // Whether order is approved (1 = approved, 0 = not approved)
  isOnHold?: number;            // Whether invoice is on hold (1 = on hold, 0 = not on hold)
  subscriptionStatus?: number;  // Subscription status (1=active, 4=cancel_soft, 5=cancel_forever)
  cancelReason?: string | null; // Cancel reason caption from cancel_reason table
  cancelReasonAbout?: string | null; // Additional cancellation details
  customerDateRegistered?: string; // Customer registration date for NEW badge check
  dateBought?: string | null;   // Date invoice was bought (for buy rate)
  datePaid?: string | null;     // Date invoice was paid (for pay rate)
}

/**
 * API response structure for detail query endpoint
 */
export interface DetailQueryResponse {
  success: boolean;
  data?: {
    records: DetailRecord[];
    total: number;            // Total count for pagination
    page: number;
    pageSize: number;
  };
  error?: string;
}
