import type { OnPageViewClickContext, OnPageDetailRecord } from '@/types/onPageDetails';
import { formatLocalDate } from '@/lib/types/api';
import { createDetailClient } from '@/lib/api/createApiClient';

interface OnPageDetailData {
  records: OnPageDetailRecord[];
  total: number;
}

const queryDetails = createDetailClient<Record<string, unknown>, OnPageDetailData>('/api/on-page-analysis/detail');

export async function fetchOnPageDetails(
  context: OnPageViewClickContext,
  pagination: { page: number; pageSize: number }
): Promise<{ records: OnPageDetailRecord[]; total: number }> {
  return queryDetails({
    dateRange: {
      start: formatLocalDate(context.filters.dateRange.start),
      end: formatLocalDate(context.filters.dateRange.end),
    },
    dimensionFilters: context.filters.dimensionFilters,
    metricId: context.metricId,
    pagination,
  });
}
