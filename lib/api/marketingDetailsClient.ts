import type { DetailRecord } from '@/types/dashboardDetails';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import { formatLocalDate } from '@/lib/types/api';
import { createDetailClient } from '@/lib/api/createApiClient';

interface FetchDetailsResponse {
  records: DetailRecord[];
  total: number;
  page: number;
  pageSize: number;
}

const queryDetails = createDetailClient<Record<string, unknown>, FetchDetailsResponse>('/api/marketing-report/details');

/**
 * Fetch detailed CRM records for a clicked metric in Marketing Report
 */
export async function fetchMarketingDetails(
  context: MarketingMetricClickContext,
  pagination?: { page: number; pageSize: number }
): Promise<FetchDetailsResponse> {
  return queryDetails({
    metricId: context.metricId,
    filters: {
      dateRange: {
        start: formatLocalDate(context.filters.dateRange.start),
        end: formatLocalDate(context.filters.dateRange.end),
      },
      network: context.filters.network,
      campaign: context.filters.campaign,
      adset: context.filters.adset,
      ad: context.filters.ad,
      date: context.filters.date,
      classifiedProduct: context.filters.classifiedProduct,
      classifiedCountry: context.filters.classifiedCountry,
    },
    pagination: pagination || { page: 1, pageSize: 50 },
  });
}
