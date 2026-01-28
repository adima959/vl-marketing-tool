import { useEffect, useRef, useState } from 'react';
import { useUrlState } from './useUrlState';

/**
 * Base row interface that report types must extend
 */
interface BaseReportRow {
  key: string;
  depth: number;
  hasChildren?: boolean;
  children?: BaseReportRow[];
}

/**
 * Store state interface that both reportStore and onPageStore must conform to
 */
interface ReportState<TRow extends BaseReportRow> {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  expandedRowKeys: string[];
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;
  reportData: TRow[];
  loadedDateRange: { start: Date; end: Date };
  loadedDimensions: string[];
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  loadData: () => Promise<void>;
  setExpandedRowKeys: (keys: string[]) => void;
  loadChildData: (key: string, value: string, depth: number) => Promise<void>;
}

/**
 * Zustand store hook type
 */
type StoreHook<TRow extends BaseReportRow> = {
  (): ReportState<TRow>;
  getState: () => ReportState<TRow>;
  setState: (partial: Partial<ReportState<TRow>>) => void;
};

/**
 * Configuration for generic URL sync
 */
export interface UseGenericUrlSyncConfig<TRow extends BaseReportRow> {
  useStore: StoreHook<TRow>;
  fetchData: (params: any) => Promise<TRow[]>;
  defaultSortColumn: string;
}

/**
 * Generic hook to sync Zustand store state with URL query parameters
 * This enables sharing and bookmarking of dashboard state
 *
 * @param config - Configuration object with store, fetchData function, and defaults
 */
export function useGenericUrlSync<TRow extends BaseReportRow>({
  useStore,
  fetchData,
  defaultSortColumn,
}: UseGenericUrlSyncConfig<TRow>) {
  const urlState = useUrlState();
  const isInitialized = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  const savedExpandedKeys = useRef<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Only run on client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const {
    dateRange,
    dimensions,
    expandedRowKeys,
    sortColumn,
    sortDirection,
    reportData,
    setSort,
    loadData,
    setExpandedRowKeys,
  } = useStore();

  // Initialize state from URL on mount
  useEffect(() => {
    if (!isMounted || isInitialized.current) return;

    isInitialized.current = true;
    isUpdatingFromUrl.current = true;

    try {
      // Parse and apply date range
      const urlDateRange = urlState.getDateRangeFromUrl();
      if (urlDateRange) {
        useStore.setState({ dateRange: urlDateRange });
      }

      // Parse and apply dimensions
      const urlDimensions = urlState.getDimensionsFromUrl();
      if (urlDimensions) {
        useStore.setState({ dimensions: urlDimensions });
      }

      // Save expanded keys for later restoration
      const urlExpandedKeys = urlState.getExpandedKeysFromUrl();
      if (urlExpandedKeys) {
        savedExpandedKeys.current = urlExpandedKeys;
      }

      // Parse and apply sort
      const urlSort = urlState.getSortFromUrl();
      if (urlSort.column) {
        setSort(urlSort.column, urlSort.direction);
      }

      // Always load data on mount (URL params restore state, then load)
      queueMicrotask(() => {
        loadData();
      });
    } finally {
      isUpdatingFromUrl.current = false;
    }
  }, [isMounted, loadData, setSort, useStore, urlState]);

  // Restore expanded rows after data loads (optimized with parallel loading per level)
  useEffect(() => {
    if (!isMounted || !isInitialized.current || isUpdatingFromUrl.current) return;
    if (savedExpandedKeys.current.length === 0 || reportData.length === 0) return;

    const restoreRows = async () => {
      const keysToRestore = savedExpandedKeys.current;
      savedExpandedKeys.current = []; // Clear to prevent re-running

      // Import dynamically to avoid circular deps
      const { findRowByKey, sortKeysByDepth } = await import('@/lib/treeUtils');
      const sortedKeys = sortKeysByDepth(keysToRestore);

      // Group keys by depth for level-by-level processing
      const keysByDepth = new Map<number, string[]>();
      for (const key of sortedKeys) {
        const depth = key.split('::').length - 1;
        if (!keysByDepth.has(depth)) {
          keysByDepth.set(depth, []);
        }
        keysByDepth.get(depth)!.push(key);
      }

      // Get sorted depth levels
      const depths = Array.from(keysByDepth.keys()).sort((a, b) => a - b);
      const allValidKeys: string[] = [];

      // Process each depth level sequentially (but parallel within each level)
      for (const depth of depths) {
        const keysAtDepth = keysByDepth.get(depth)!;
        const rowsToLoad: Array<{ key: string; row: any }> = [];
        const state = useStore.getState();

        // Find rows at this depth level
        for (const key of keysAtDepth) {
          const currentData = useStore.getState().reportData;
          const row = findRowByKey(currentData, key);

          if (row) {
            allValidKeys.push(key);
            if (row.hasChildren && (!row.children || row.children.length === 0)) {
              rowsToLoad.push({ key, row });
            }
          }
        }

        // Fetch all children data in parallel, then update tree once
        if (rowsToLoad.length > 0) {
          const childDataPromises = rowsToLoad.map(({ key, row }) => {
            const keyParts = key.split('::');
            const parentFilters: Record<string, string> = {};
            keyParts.forEach((value, index) => {
              const dimension = state.loadedDimensions[index];
              if (dimension) {
                parentFilters[dimension] = value;
              }
            });

            return fetchData({
              dateRange: state.loadedDateRange,
              dimensions: state.loadedDimensions,
              depth: row.depth + 1,
              parentFilters,
              sortBy: state.sortColumn || defaultSortColumn,
              sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
            })
              .then((children) => ({ success: true, key, children }))
              .catch((error) => {
                console.warn(`Failed to restore expanded row ${key}:`, error);
                return { success: false, key, children: [] };
              });
          });

          const results = await Promise.allSettled(childDataPromises);

          // Update tree once with all children for this depth level
          const updateTree = (rows: TRow[]): TRow[] => {
            return rows.map((row) => {
              // Check if this row has new children data
              for (const result of results) {
                if (result.status === 'fulfilled' && result.value.success && result.value.key === row.key) {
                  return { ...row, children: result.value.children } as TRow;
                }
              }
              // Recursively update children
              if (row.children && row.children.length > 0) {
                return { ...row, children: updateTree(row.children as TRow[]) } as TRow;
              }
              return row;
            });
          };

          const currentReportData = useStore.getState().reportData;
          useStore.setState({ reportData: updateTree(currentReportData) });

          // Small delay to ensure state has propagated
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      // Set all valid expanded keys at once
      setExpandedRowKeys(allValidKeys);
    };

    restoreRows();
  }, [reportData.length, isMounted, useStore, fetchData, defaultSortColumn, setExpandedRowKeys]);

  // Update URL when store state changes
  useEffect(() => {
    if (!isMounted || !isInitialized.current || isUpdatingFromUrl.current) return;

    const params = new URLSearchParams();

    // Add date range
    params.set('start', dateRange.start.toISOString().split('T')[0]);
    params.set('end', dateRange.end.toISOString().split('T')[0]);

    // Add dimensions
    if (dimensions.length > 0) {
      params.set('dimensions', dimensions.join(','));
    }

    // Add expanded rows (only if there are any)
    if (expandedRowKeys.length > 0) {
      params.set('expanded', expandedRowKeys.join(','));
    }

    // Add sort
    if (sortColumn) {
      params.set('sortBy', sortColumn);
      if (sortDirection) {
        params.set('sortDir', sortDirection);
      }
    }

    // Update URL without triggering Next.js navigation/RSC refetch
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  }, [
    isMounted,
    dateRange,
    dimensions,
    expandedRowKeys,
    sortColumn,
    sortDirection,
  ]);
}
