import { createQueryClient } from '@/lib/api/createApiClient';
import { formatLocalDate } from '@/lib/types/api';
import type { MarketingFlatRow } from '@/lib/utils/marketingTree';

interface MarketingFlatRequest {
  dateRange: { start: string; end: string };
  dimensions: string[];
  filters?: Array<{ field: string; operator: string; value: string }>;
}

const queryMarketing = createQueryClient<MarketingFlatRequest, MarketingFlatRow[]>('/api/marketing/query');

export interface FetchMarketingFlatParams {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  filters?: Array<{ field: string; operator: string; value: string }>;
}

/**
 * Fetch flat marketing data from the API.
 * Returns rows grouped by all dimensions with base metrics only.
 */
export async function fetchMarketingDataFlat(
  params: FetchMarketingFlatParams,
  timeoutMs: number = 30000,
): Promise<MarketingFlatRow[]> {
  return queryMarketing(
    {
      dateRange: {
        start: formatLocalDate(params.dateRange.start),
        end: formatLocalDate(params.dateRange.end),
      },
      dimensions: params.dimensions,
      filters: params.filters,
    },
    timeoutMs,
  );
}
