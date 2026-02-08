/**
 * Raw row from merged_ads_spending view (unified FB + Google Ads)
 */
export interface RawAdDataRow {
  network: string;           // "Facebook" | "Google Ads"
  date: string;              // Date string (YYYY-MM-DD)
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  cost: string;              // Numeric stored as string
  currency: string;          // "NOK"
  clicks: number;
  impressions: number;
  ctr_percent: string;       // Numeric stored as string
  cpc: string;               // Numeric stored as string
  cpm: string;               // Numeric stored as string
  conversions: string;       // Numeric stored as string
  crm_subscriptions: string; // Numeric stored as string
  approved_sales: string;    // Numeric stored as string
}

/**
 * Aggregated row after GROUP BY
 */
export interface AggregatedMetrics {
  dimension_value: string;   // The grouped value (e.g., "Facebook", "Campaign A")
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr_percent: number;
  cpc: number;
  cpm: number;
  conversion_rate: number;
  crm_subscriptions: number;
  approved_sales: number;
}

/**
 * Validates that a sort direction value is either 'ASC' or 'DESC'.
 * Prevents SQL injection via ORDER BY clause interpolation,
 * since TypeScript types are not enforced at runtime.
 */
export function validateSortDirection(direction: string): 'ASC' | 'DESC' {
  if (direction === 'ASC' || direction === 'DESC') return direction;
  throw new Error(`Invalid sort direction: ${direction}`);
}

/**
 * Query options for building SQL
 */
export interface QueryOptions {
  dateRange: {
    start: Date;
    end: Date;
  };
  dimensions: string[];      // Array of dimension IDs
  depth: number;             // Current depth in hierarchy (0-based)
  parentFilters?: Record<string, string>; // Filters from parent rows (drill-down)
  filters?: Array<{ field: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>; // Top-level dimension filters
  sortBy?: string;           // Metric to sort by
  sortDirection?: 'ASC' | 'DESC';
  limit?: number;            // Max rows to return
}
