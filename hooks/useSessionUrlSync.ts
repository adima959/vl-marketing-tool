import { useSessionStore } from '@/stores/sessionStore';
import { SESSION_DIMENSION_VALID_KEYS } from '@/config/sessionDimensions';
import type { SessionReportRow } from '@/types/sessionReport';
import { useGenericUrlSync } from './useGenericUrlSync';

const SESSION_DEFAULT_DIMS = ['entryUrlPath', 'entryUtmSource', 'entryPageType', 'entryCountryCode', 'entryDeviceType', 'date'];

/**
 * No-op fetch stub — tree is pre-built with all children by buildSessionTree,
 * so restoreExpandedRows (with skipIfChildrenExist: true) never calls this.
 */
const noopFetchData = async (): Promise<SessionReportRow[]> => [];

/**
 * Hook to sync session analytics store state with URL query parameters.
 * Uses dimensionValidation to filter out stale dimensions from the URL.
 */
export function useSessionUrlSync() {
  return useGenericUrlSync<SessionReportRow>({
    useStore: useSessionStore,
    fetchData: noopFetchData,
    defaultSortColumn: 'pageViews',
    defaultDimensions: SESSION_DEFAULT_DIMS,
    dimensionValidation: {
      validKeys: SESSION_DIMENSION_VALID_KEYS,
      defaults: SESSION_DEFAULT_DIMS,
    },
  });
}
