import { fetchDashboardData } from '@/lib/api/dashboardClient';
import type { DashboardRow } from '@/types/dashboard';
import { createTableStore } from './createTableStore';

export const useDashboardStore = createTableStore<DashboardRow>({
  fetchData: (params) => fetchDashboardData(params),
  defaultDateRange: () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return { start: today, end };
  },
  defaultDimensions: ['country', 'productName', 'product', 'source'],
  defaultSortColumn: 'subscriptions',
  defaultSortDirection: 'descend',
  hasFilters: false,
});
