import { useEffect, useRef, useState } from 'react';
import {
  useQueryStates,
  parseAsIsoDate,
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import type { TableFilter } from '@/types/filters';

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
  filters: TableFilter[];
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
 * Serialize filters to a compact URL-safe JSON string.
 * Each filter is encoded as "field.operator.value" joined by "|".
 */
function serializeFilters(filters: TableFilter[]): string | null {
  const valid = filters.filter(f => f.field && f.value);
  if (valid.length === 0) return null;
  return JSON.stringify(valid.map(({ field, operator, value }) => ({ field, operator, value })));
}

/**
 * Deserialize filters from URL JSON string back to TableFilter[].
 */
function deserializeFilters(raw: string | null): TableFilter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((f: { field: string; operator: string; value: string }, i: number) => ({
      id: `url-${i}-${Date.now()}`,
      field: f.field || '',
      operator: (f.operator || 'equals') as TableFilter['operator'],
      value: f.value || '',
    }));
  } catch {
    return [];
  }
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
  // Define URL parsers with defaults
  const getDefaultDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const urlParsers = {
    start: parseAsIsoDate.withDefault(getDefaultDateRange()),
    end: parseAsIsoDate.withDefault(getDefaultDateRange()),
    dimensions: parseAsArrayOf(parseAsString).withDefault([]),
    expanded: parseAsArrayOf(parseAsString).withDefault([]),
    sortBy: parseAsString.withDefault(defaultSortColumn),
    sortDir: parseAsStringLiteral(['ascend', 'descend'] as const).withDefault('descend'),
    filters: parseAsString.withDefault(''),
  } as const;

  const [urlState, setUrlState] = useQueryStates(urlParsers, {
    history: 'replace',
    shallow: true,
  });

  const isInitialized = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  const savedExpandedKeys = useRef<string[]>([]);
  const hasRestoredOnce = useRef(false);
  const [isMounted, setIsMounted] = useState(false);

  // Only run on client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const {
    dateRange,
    dimensions,
    filters,
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

    // If viewId is present, skip URL init — useApplyViewFromUrl will handle it
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('viewId')) {
      isInitialized.current = true;
      return;
    }

    isInitialized.current = true;
    isUpdatingFromUrl.current = true;

    try {
      // Parse and apply date range from URL
      if (urlState.start && urlState.end) {
        useStore.setState({
          dateRange: { start: urlState.start, end: urlState.end }
        });
      }

      // Parse and apply dimensions from URL
      if (urlState.dimensions && urlState.dimensions.length > 0) {
        useStore.setState({ dimensions: urlState.dimensions });
      }

      // Parse and apply filters from URL
      if (urlState.filters) {
        const parsedFilters = deserializeFilters(urlState.filters);
        if (parsedFilters.length > 0) {
          useStore.setState({ filters: parsedFilters });
        }
      }

      // Save expanded keys for later restoration (deduplicate from URL)
      if (urlState.expanded && urlState.expanded.length > 0) {
        savedExpandedKeys.current = Array.from(new Set(urlState.expanded));
      }

      // Parse and apply sort from URL
      if (urlState.sortBy) {
        setSort(urlState.sortBy, urlState.sortDir || 'descend');
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
    if (hasRestoredOnce.current) return; // Only restore once after initial load
    if (savedExpandedKeys.current.length === 0 || reportData.length === 0) return;

    const restoreRows = async () => {
      hasRestoredOnce.current = true; // Mark as restored to prevent re-running
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

    setUrlState({
      start: dateRange.start,
      end: dateRange.end,
      dimensions: dimensions.length > 0 ? dimensions : null, // null removes param
      expanded: expandedRowKeys.length > 0 ? Array.from(new Set(expandedRowKeys)) : null,
      sortBy: sortColumn || defaultSortColumn,
      sortDir: sortDirection || 'descend',
      filters: serializeFilters(filters),
    });
  }, [
    isMounted,
    dateRange,
    dimensions,
    filters,
    expandedRowKeys,
    sortColumn,
    sortDirection,
    setUrlState,
    defaultSortColumn,
  ]);
}
