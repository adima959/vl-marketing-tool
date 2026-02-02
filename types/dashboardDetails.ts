import type { DateRange } from '@/types/dashboard';

/**
 * Context passed when a metric cell is clicked
 * Contains all information needed to query for detail records
 */
export interface MetricClickContext {
  metricId: 'customers' | 'subscriptions' | 'trials' | 'trialsApproved' | 'upsells';
  metricLabel: string;       // Human-readable name for modal title
  value: number;             // Aggregated count that was clicked
  filters: {
    dateRange: DateRange;
    country?: string;        // Depth 0 filter (always present if depth >= 0)
    product?: string;        // Depth 1 filter (present if depth >= 1)
    source?: string;         // Depth 2 filter (present if depth >= 2)
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
  subscriptionStatus?: number;  // Subscription status (1=active, 4=cancel_soft, 5=cancel_forever)
  cancelReason?: string | null; // Cancel reason caption from cancel_reason table
  cancelReasonAbout?: string | null; // Additional cancellation details
  customerDateRegistered?: string; // Customer registration date for NEW badge check
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
