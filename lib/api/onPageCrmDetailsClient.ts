import type { DetailRecord } from '@/types/dashboardDetails';
import type { OnPageViewClickContext } from '@/types/onPageDetails';
import { triggerAuthError, isAuthError } from '@/lib/api/authErrorHandler';
import { formatLocalDate } from '@/lib/types/api';

interface FetchDetailsResponse {
  records: DetailRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Fetch CRM detail records for a clicked CRM metric in On-Page Analysis.
 * Queries the on-page CRM details route which goes directly to MariaDB.
 */
export async function fetchOnPageCrmDetails(
  context: OnPageViewClickContext,
  pagination?: { page: number; pageSize: number }
): Promise<FetchDetailsResponse> {
  const response = await fetch('/api/on-page-analysis/crm-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metricId: context.metricId,
      dateRange: {
        start: formatLocalDate(context.filters.dateRange.start),
        end: formatLocalDate(context.filters.dateRange.end),
      },
      dimensionFilters: context.filters.dimensionFilters,
      pagination: pagination || { page: 1, pageSize: 100 },
    }),
  });

  if (!response.ok) {
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
