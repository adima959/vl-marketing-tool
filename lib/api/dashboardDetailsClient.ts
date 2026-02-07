import type { DetailRecord, MetricClickContext } from '@/types/dashboardDetails';
import { triggerAuthError, isAuthError } from '@/lib/api/authErrorHandler';
import { formatLocalDate } from '@/lib/types/api';

/**
 * Response from the dashboard details API
 */
interface FetchDetailsResponse {
  records: DetailRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Fetch detailed records for a clicked metric
 *
 * @param context - Context from the clicked metric (metric type, filters, etc.)
 * @param pagination - Optional pagination settings (default: page 1, pageSize 50)
 * @returns Promise with records, total count, and pagination info
 * @throws Error if the API request fails
 */
export async function fetchDashboardDetails(
  context: MetricClickContext,
  pagination?: { page: number; pageSize: number }
): Promise<FetchDetailsResponse> {
  const response = await fetch('/api/dashboard/details', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      metricId: context.metricId,
      filters: {
        dateRange: {
          start: formatLocalDate(context.filters.dateRange.start),
          end: formatLocalDate(context.filters.dateRange.end),
        },
        country: context.filters.country,
        product: context.filters.product,
        source: context.filters.source,
        excludeDeleted: context.filters.excludeDeleted,
        excludeUpsellTags: context.filters.excludeUpsellTags,
        rateType: context.filters.rateType,
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
