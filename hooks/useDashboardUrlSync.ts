import { useGenericUrlSync } from './useGenericUrlSync';
import { useDashboardStore } from '@/stores/dashboardStore';
import { fetchDashboardData } from '@/lib/api/dashboardClient';

/**
 * Dashboard-specific URL sync with fixed dimensions
 *
 * Dashboard has a fixed 4-level hierarchy that doesn't change,
 * so dimensions are not synced to/from URL (skipDimensions: true)
 */
export function useDashboardUrlSync() {
  return useGenericUrlSync({
    useStore: useDashboardStore,
    fetchData: fetchDashboardData,
    defaultSortColumn: 'subscriptions',
    skipDimensions: true, // Dashboard dimensions are fixed
  });
}
