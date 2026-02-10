import { fetchMarketingData } from '@/lib/api/marketingClient';
import type { ReportRow } from '@/types';
import { createTableStore } from './createTableStore';

export const useReportStore = createTableStore<ReportRow>({
  fetchData: (params) => fetchMarketingData(params),
  defaultDateRange: () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const end = new Date(yesterday);
    end.setHours(23, 59, 59, 999);
    return { start: yesterday, end };
  },
  defaultDimensions: ['network', 'campaign', 'adset'],
  defaultSortColumn: 'clicks',
  defaultSortDirection: 'descend',
  hasFilters: true,
});
