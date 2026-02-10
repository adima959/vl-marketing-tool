import { fetchOnPageData } from '@/lib/api/onPageClient';
import type { OnPageReportRow } from '@/types/onPageReport';
import { createTableStore } from './createTableStore';

export const useOnPageStore = createTableStore<OnPageReportRow>({
  fetchData: (params) => fetchOnPageData(params),
  defaultDateRange: () => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  },
  defaultDimensions: ['utmSource', 'countryCode', 'urlPath', 'campaign', 'adset', 'ad'],
  defaultSortColumn: 'pageViews',
  defaultSortDirection: 'descend',
  hasFilters: true,
});
