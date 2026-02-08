import type { OnPageViewClickContext, OnPageDetailRecord, OnPageDetailResponse, PageTypeSummary } from '@/types/onPageDetails';

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function fetchOnPageDetails(
  context: OnPageViewClickContext,
  pagination: { page: number; pageSize: number },
  pageTypeFilter?: string
): Promise<{ records: OnPageDetailRecord[]; total: number; pageTypeSummary: PageTypeSummary[] }> {
  const response = await fetch('/api/on-page-analysis/detail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRange: {
        start: formatLocalDate(context.filters.dateRange.start),
        end: formatLocalDate(context.filters.dateRange.end),
      },
      dimensionFilters: context.filters.dimensionFilters,
      metricId: context.metricId,
      pageTypeFilter,
      pagination,
    }),
  });

  const data: OnPageDetailResponse = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to fetch page view details');
  }

  return {
    records: data.data.records,
    total: data.data.total,
    pageTypeSummary: data.data.pageTypeSummary,
  };
}
