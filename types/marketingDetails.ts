import type { DateRange } from '@/types';
import type { MarketingDetailMetricId } from '@/lib/server/crmMetrics';

/**
 * Context passed when a CRM metric cell is clicked in Marketing Report
 * Contains all information needed to query for detail records
 */
export interface MarketingMetricClickContext {
  metricId: MarketingDetailMetricId;
  metricLabel: string;       // Human-readable name for modal title
  value: number;             // Aggregated count that was clicked
  filters: {
    dateRange: DateRange;
    network?: string;        // Maps to source (Google Ads -> adwords/google, Facebook -> facebook/meta)
    campaign?: string;       // Maps to tracking_id_4
    adset?: string;          // Maps to tracking_id_2
    ad?: string;             // Maps to tracking_id
    date?: string;           // Specific date filter (ISO string)
    classifiedProduct?: string;  // Classification dimension: product name
    classifiedCountry?: string;  // Classification dimension: country code
  };
}

/**
 * API request body for marketing details endpoint
 */
export interface MarketingDetailRequest {
  metricId: MarketingDetailMetricId;
  filters: {
    dateRange: { start: string; end: string };
    network?: string;
    campaign?: string;
    adset?: string;
    ad?: string;
    date?: string;
    classifiedProduct?: string;
    classifiedCountry?: string;
  };
  pagination?: { page: number; pageSize: number };
}

/**
 * Individual record shown in modal (reusing DetailRecord from dashboardDetails)
 */
export type { DetailRecord } from '@/types/dashboardDetails';

/**
 * API response structure for marketing detail query endpoint
 */
export interface MarketingDetailResponse {
  success: boolean;
  data?: {
    records: import('@/types/dashboardDetails').DetailRecord[];
    total: number;
    page: number;
    pageSize: number;
  };
  error?: string;
}
