import { useSearchParams } from 'next/navigation';
import type { DateRange } from '@/types';

/**
 * Hook to parse initial state from URL parameters
 */
export function useUrlState() {
  const searchParams = useSearchParams();

  return {
    /**
     * Parse date range from URL params
     */
    getDateRangeFromUrl: (): DateRange | null => {
      const startDate = searchParams.get('start');
      const endDate = searchParams.get('end');

      if (startDate && endDate) {
        return {
          start: new Date(startDate),
          end: new Date(endDate),
        };
      }
      return null;
    },

    /**
     * Parse dimensions array from URL params
     * Supports both formats:
     * - ?dimensions=network,campaign,adset
     * - ?dimensions=network&dimensions=campaign&dimensions=adset
     */
    getDimensionsFromUrl: (): string[] | null => {
      // Check for multiple dimension parameters first
      const allDimensions = searchParams.getAll('dimensions');
      if (allDimensions.length > 1) {
        // Multiple parameters: ?dimensions=network&dimensions=campaign
        return allDimensions.filter(Boolean);
      }

      // Single parameter with comma-separated values
      const dimensionsParam = searchParams.get('dimensions');
      if (dimensionsParam) {
        const dims = dimensionsParam.split(',').filter(Boolean);
        return dims.length > 0 ? dims : null;
      }
      return null;
    },

    /**
     * Parse expanded row keys from URL params
     */
    getExpandedKeysFromUrl: (): string[] | null => {
      const expandedParam = searchParams.get('expanded');
      if (expandedParam) {
        const expanded = expandedParam.split(',').filter(Boolean);
        return expanded.length > 0 ? expanded : null;
      }
      return null;
    },

    /**
     * Parse sort configuration from URL params
     */
    getSortFromUrl: (): {
      column: string | null;
      direction: 'ascend' | 'descend' | null;
    } => {
      const sortCol = searchParams.get('sortBy');
      const sortDir = searchParams.get('sortDir');

      return {
        column: sortCol,
        direction:
          sortDir === 'ascend' || sortDir === 'descend' ? sortDir : null,
      };
    },

    /**
     * Check if any URL parameters are present
     */
    hasUrlParams: (): boolean => {
      return (
        searchParams.has('start') ||
        searchParams.has('end') ||
        searchParams.has('dimensions') ||
        searchParams.has('expanded') ||
        searchParams.has('sortBy')
      );
    },
  };
}
