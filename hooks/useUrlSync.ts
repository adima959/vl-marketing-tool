import { useReportStore } from '@/stores/reportStore';
import { fetchReportData } from '@/lib/api/client';
import type { ReportRow } from '@/types';
import { useGenericUrlSync } from './useGenericUrlSync';

/**
 * Hook to sync marketing report store state with URL query parameters
 * This enables sharing and bookmarking of dashboard state
 */
export function useUrlSync() {
  return useGenericUrlSync<ReportRow>({
    useStore: useReportStore,
    fetchData: fetchReportData,
    defaultSortColumn: 'clicks',
  });
}
