import { useReportStore } from '@/stores/reportStore';
import { fetchMarketingData } from '@/lib/api/marketingClient';
import type { ReportRow } from '@/types';
import { useGenericUrlSync } from './useGenericUrlSync';

/**
 * Hook to sync marketing report store state with URL query parameters
 * This enables sharing and bookmarking of dashboard state
 */
export function useUrlSync() {
  return useGenericUrlSync<ReportRow>({
    useStore: useReportStore,
    fetchData: fetchMarketingData,
    defaultSortColumn: 'clicks',
  });
}
