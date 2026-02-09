import { serializeQueryParams } from '@/lib/types/api';
import type { QueryParams, QueryRequest } from '@/lib/types/api';
import type { OnPageReportRow } from '@/types/onPageReport';
import { createQueryClient } from '@/lib/api/createApiClient';

const queryOnPage = createQueryClient<QueryRequest, OnPageReportRow[]>('/api/on-page-analysis/query');

/**
 * Fetch on-page analysis data from API with timeout support
 */
export async function fetchOnPageData(
  params: QueryParams,
  timeoutMs: number = 30000
): Promise<OnPageReportRow[]> {
  const body = serializeQueryParams(params);
  return queryOnPage(body, timeoutMs);
}
