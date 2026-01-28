import { useOnPageStore } from '@/stores/onPageStore';
import { fetchOnPageData } from '@/lib/api/onPageClient';
import type { OnPageReportRow } from '@/types/onPageReport';
import { useGenericUrlSync } from './useGenericUrlSync';

/**
 * Hook to sync on-page analysis store state with URL query parameters
 * This enables sharing and bookmarking of dashboard state
 */
export function useOnPageUrlSync() {
  return useGenericUrlSync<OnPageReportRow>({
    useStore: useOnPageStore,
    fetchData: fetchOnPageData,
    defaultSortColumn: 'pageViews',
  });
}
