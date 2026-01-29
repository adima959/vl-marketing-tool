import { useGenericUrlSync } from './useGenericUrlSync';
import { useDashboardStore } from '@/stores/dashboardStore';
import { fetchDashboardData } from '@/lib/api/dashboardClient';
import type { DashboardRow } from '@/types/dashboard';

export function useDashboardUrlSync() {
  return useGenericUrlSync<DashboardRow>({
    useStore: useDashboardStore,
    fetchData: fetchDashboardData,
    defaultSortColumn: 'subscriptions',
  });
}
