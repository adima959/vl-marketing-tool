import { serializeQueryParams } from '@/lib/types/api';
import type { QueryParams, QueryRequest } from '@/lib/types/api';
import type { SessionReportRow } from '@/types/sessionReport';
import { createQueryClient } from '@/lib/api/createApiClient';

const querySession = createQueryClient<QueryRequest, SessionReportRow[]>('/api/on-page-analysis/sessions/query');

/**
 * Fetch session-based analytics data from API with timeout support
 */
export async function fetchSessionData(
  params: QueryParams,
  timeoutMs: number = 30000
): Promise<SessionReportRow[]> {
  const body = serializeQueryParams(params);
  return querySession(body, timeoutMs);
}
