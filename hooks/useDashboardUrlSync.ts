import { useGenericUrlSync } from './useGenericUrlSync';
import { useDashboardStore } from '@/stores/dashboardStore';
import { fetchDashboardData } from '@/lib/api/dashboardClient';

/**
 * Dashboard-specific URL sync
 *
 * Uses generic URL sync with dashboard-specific defaults.
 * Dimensions are synced to/from URL and can be changed by the user.
 */
export function useDashboardUrlSync() {
  return useGenericUrlSync({
    useStore: useDashboardStore,
    fetchData: fetchDashboardData,
    defaultSortColumn: 'subscriptions',
    // skipDimensions removed - dimensions are now dynamic and URL-synced
  });
}
