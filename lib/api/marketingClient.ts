import { serializeQueryParams } from '@/lib/types/api';
import type { QueryParams, QueryRequest } from '@/lib/types/api';
import type { ReportRow } from '@/types/report';
import { createQueryClient } from '@/lib/api/createApiClient';

const queryMarketing = createQueryClient<QueryRequest & { productFilter?: string }, ReportRow[]>('/api/marketing/query');

/**
 * Fetch marketing report data from two-database API with timeout support
 * Uses PostgreSQL for ads data and MariaDB for CRM data with product filtering
 */
export async function fetchMarketingData(
  params: QueryParams & { productFilter?: string },
  timeoutMs: number = 30000
): Promise<ReportRow[]> {
  const body = {
    ...serializeQueryParams(params),
    productFilter: params.productFilter,
  };
  return queryMarketing(body, timeoutMs);
}
