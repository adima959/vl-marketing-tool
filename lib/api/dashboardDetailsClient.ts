import type { DetailRecord, MetricClickContext } from '@/types/dashboardDetails';
import { formatLocalDate } from '@/lib/types/api';
import { createDetailClient } from '@/lib/api/createApiClient';

interface FetchDetailsResponse {
  records: DetailRecord[];
  total: number;
  page: number;
  pageSize: number;
}

const queryDetails = createDetailClient<Record<string, unknown>, FetchDetailsResponse>('/api/dashboard/details');

/**
 * Fetch detailed records for a clicked metric
 */
export async function fetchDashboardDetails(
  context: MetricClickContext,
  pagination?: { page: number; pageSize: number }
): Promise<FetchDetailsResponse> {
  return queryDetails({
    metricId: context.metricId,
    filters: {
      dateRange: {
        start: formatLocalDate(context.filters.dateRange.start),
        end: formatLocalDate(context.filters.dateRange.end),
      },
      country: context.filters.country,
      productName: context.filters.productName,
      product: context.filters.product,
      source: context.filters.source,
      excludeDeleted: context.filters.excludeDeleted,
      excludeUpsellTags: context.filters.excludeUpsellTags,
      rateType: context.filters.rateType,
    },
    pagination: pagination || { page: 1, pageSize: 50 },
  });
}
