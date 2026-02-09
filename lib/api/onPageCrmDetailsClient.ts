import type { DetailRecord } from '@/types/dashboardDetails';
import type { OnPageViewClickContext } from '@/types/onPageDetails';
import { formatLocalDate } from '@/lib/types/api';
import { createDetailClient } from '@/lib/api/createApiClient';

interface FetchDetailsResponse {
  records: DetailRecord[];
  total: number;
  page: number;
  pageSize: number;
}

const queryDetails = createDetailClient<Record<string, unknown>, FetchDetailsResponse>('/api/on-page-analysis/crm-details');

/**
 * Fetch CRM detail records for a clicked CRM metric in On-Page Analysis.
 */
export async function fetchOnPageCrmDetails(
  context: OnPageViewClickContext,
  pagination?: { page: number; pageSize: number }
): Promise<FetchDetailsResponse> {
  return queryDetails({
    metricId: context.metricId,
    dateRange: {
      start: formatLocalDate(context.filters.dateRange.start),
      end: formatLocalDate(context.filters.dateRange.end),
    },
    dimensionFilters: context.filters.dimensionFilters,
    pagination: pagination || { page: 1, pageSize: 100 },
  });
}
