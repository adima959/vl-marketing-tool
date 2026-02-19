import { formatLocalDate } from '@/lib/types/api';
import type { DateRange } from '@/lib/types/api';
import type { SessionFlatRow } from '@/lib/utils/sessionTree';
import { createQueryClient } from '@/lib/api/createApiClient';

interface FlatQueryRequest {
  dateRange: { start: string; end: string };
  dimensions: string[];
  filters?: Array<{ field: string; operator: string; value: string }>;
}

const querySession = createQueryClient<FlatQueryRequest, SessionFlatRow[]>('/api/on-page-analysis/sessions/query');

/**
 * Fetch flat session analytics data (all dimensions grouped in one query).
 * Returns raw rows — client builds the hierarchical tree.
 */
export async function fetchSessionDataFlat(
  params: {
    dateRange: DateRange;
    dimensions: string[];
    filters?: Array<{ field: string; operator: string; value: string }>;
  },
  timeoutMs: number = 30000
): Promise<SessionFlatRow[]> {
  const body: FlatQueryRequest = {
    dateRange: {
      start: formatLocalDate(params.dateRange.start),
      end: formatLocalDate(params.dateRange.end),
    },
    dimensions: params.dimensions,
    filters: params.filters,
  };
  return querySession(body, timeoutMs);
}
