import { fetchSessionData } from '@/lib/api/sessionClient';
import type { SessionReportRow } from '@/types/sessionReport';
import { createTableStore } from './createTableStore';

export const useSessionStore = createTableStore<SessionReportRow>({
  fetchData: (params) => fetchSessionData(params),
  defaultDateRange: () => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  },
  defaultDimensions: ['entryUrlPath', 'entryUtmSource', 'entryPageType', 'entryCountryCode', 'entryDeviceType', 'date'],
  defaultSortColumn: 'pageViews',
  defaultSortDirection: 'descend',
  hasFilters: true,
});
