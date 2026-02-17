import { useReportStore } from '@/stores/reportStore';
import type { ReportRow } from '@/types';
import { useGenericUrlSync } from './useGenericUrlSync';

/**
 * Hook to sync marketing report store state with URL query parameters.
 * fetchData is a no-op — the tree is fully built client-side,
 * so expanded-row restoration never needs to fetch children.
 */
export function useUrlSync() {
  return useGenericUrlSync<ReportRow>({
    useStore: useReportStore,
    fetchData: async () => [],
    defaultSortColumn: 'clicks',
  });
}
