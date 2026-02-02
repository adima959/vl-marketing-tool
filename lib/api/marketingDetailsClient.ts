import type { DetailRecord } from '@/types/dashboardDetails';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import { triggerAuthError, isAuthError } from '@/lib/api/authErrorHandler';

/**
 * Response from the marketing details API
 */
interface FetchDetailsResponse {
  records: DetailRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Fetch detailed CRM records for a clicked metric in Marketing Report
 *
 * @param context - Context from the clicked metric (metric type, filters, etc.)
 * @param pagination - Optional pagination settings (default: page 1, pageSize 50)
 * @returns Promise with records, total count, and pagination info
 * @throws Error if the API request fails
 */
export async function fetchMarketingDetails(
  context: MarketingMetricClickContext,
  pagination?: { page: number; pageSize: number }
): Promise<FetchDetailsResponse> {
  const response = await fetch('/api/marketing-report/details', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      metricId: context.metricId,
      filters: {
        dateRange: {
          start: context.filters.dateRange.start.toISOString(),
          end: context.filters.dateRange.end.toISOString(),
        },
        network: context.filters.network,
        campaign: context.filters.campaign,
        adset: context.filters.adset,
        ad: context.filters.ad,
        date: context.filters.date,
      },
      pagination: pagination || { page: 1, pageSize: 50 },
    }),
  });

  if (!response.ok) {
    // Handle authentication errors globally
    if (isAuthError(response.status)) {
      triggerAuthError();
    }

    const error = await response.json().catch(() => ({ error: 'Failed to fetch details' }));
    throw new Error(error.error || `HTTP error ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Unknown error occurred');
  }

  if (!result.data) {
    throw new Error('No data returned from API');
  }

  return result.data;
}
