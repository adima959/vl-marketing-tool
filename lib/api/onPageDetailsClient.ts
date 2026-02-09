import type { OnPageViewClickContext, OnPageDetailRecord, PageTypeSummary } from '@/types/onPageDetails';
import { formatLocalDate } from '@/lib/types/api';
import { createDetailClient } from '@/lib/api/createApiClient';

interface OnPageDetailData {
  records: OnPageDetailRecord[];
  total: number;
  pageTypeSummary: PageTypeSummary[];
}

const queryDetails = createDetailClient<Record<string, unknown>, OnPageDetailData>('/api/on-page-analysis/detail');

export async function fetchOnPageDetails(
  context: OnPageViewClickContext,
  pagination: { page: number; pageSize: number },
  pageTypeFilter?: string
): Promise<{ records: OnPageDetailRecord[]; total: number; pageTypeSummary: PageTypeSummary[] }> {
  return queryDetails({
    dateRange: {
      start: formatLocalDate(context.filters.dateRange.start),
      end: formatLocalDate(context.filters.dateRange.end),
    },
    dimensionFilters: context.filters.dimensionFilters,
    metricId: context.metricId,
    pageTypeFilter,
    pagination,
  });
}
