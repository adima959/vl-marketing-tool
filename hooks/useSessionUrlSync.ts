import { useSessionStore } from '@/stores/sessionStore';
import { fetchSessionData } from '@/lib/api/sessionClient';
import { SESSION_DIMENSION_VALID_KEYS } from '@/config/sessionDimensions';
import type { SessionReportRow } from '@/types/sessionReport';
import { useGenericUrlSync } from './useGenericUrlSync';

const SESSION_DEFAULT_DIMS = ['entryUrlPath', 'entryUtmSource', 'entryPageType', 'entryCountryCode', 'entryDeviceType', 'date'];

/**
 * Hook to sync session analytics store state with URL query parameters.
 * Uses dimensionValidation to filter out stale Page Views dimensions
 * that may linger in the URL when switching from Page Views mode.
 */
export function useSessionUrlSync() {
  return useGenericUrlSync<SessionReportRow>({
    useStore: useSessionStore,
    fetchData: fetchSessionData,
    defaultSortColumn: 'pageViews',
    defaultDimensions: SESSION_DEFAULT_DIMS,
    dimensionValidation: {
      validKeys: SESSION_DIMENSION_VALID_KEYS,
      defaults: SESSION_DEFAULT_DIMS,
    },
  });
}
