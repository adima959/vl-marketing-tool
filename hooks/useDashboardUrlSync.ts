import { useEffect, useRef, useState } from 'react';
import {
  useQueryStates,
  parseAsIsoDate,
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import { useDashboardStore } from '@/stores/dashboardStore';
import { fetchDashboardData } from '@/lib/api/dashboardClient';

/**
 * Dashboard-specific URL sync that enforces fixed 3-level hierarchy
 * Unlike generic URL sync, dimensions are NOT restored from URL
 */
export function useDashboardUrlSync() {
  const getDefaultDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const urlParsers = {
    start: parseAsIsoDate.withDefault(getDefaultDateRange()),
    end: parseAsIsoDate.withDefault(getDefaultDateRange()),
    expanded: parseAsArrayOf(parseAsString).withDefault([]),
    sortBy: parseAsString.withDefault('subscriptions'),
    sortDir: parseAsStringLiteral(['ascend', 'descend'] as const).withDefault('descend'),
  } as const;

  const [urlState, setUrlState] = useQueryStates(urlParsers, {
    history: 'replace',
    shallow: true,
  });

  const isInitialized = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  const savedExpandedKeys = useRef<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const {
    dateRange,
    expandedRowKeys,
    sortColumn,
    sortDirection,
    reportData,
    setSort,
    loadData,
    setExpandedRowKeys,
  } = useDashboardStore();

  // Initialize state from URL on mount
  useEffect(() => {
    if (!isMounted || isInitialized.current) return;

    isInitialized.current = true;
    isUpdatingFromUrl.current = true;

    try {
      // Parse and apply date range from URL
      if (urlState.start && urlState.end) {
        useDashboardStore.setState({
          dateRange: { start: urlState.start, end: urlState.end }
        });
      }

      // NOTE: Dashboard uses fixed dimensions [country, product, source]
      // DO NOT restore dimensions from URL

      // Save expanded keys for later restoration
      if (urlState.expanded && urlState.expanded.length > 0) {
        savedExpandedKeys.current = urlState.expanded;
      }

      // Parse and apply sort from URL
      if (urlState.sortBy) {
        setSort(urlState.sortBy, urlState.sortDir || 'descend');
      }

      // Always load data on mount
      queueMicrotask(() => {
        loadData();
      });
    } finally {
      isUpdatingFromUrl.current = false;
    }
  }, [isMounted, loadData, setSort, urlState]);

  // Restore expanded rows after data loads
  useEffect(() => {
    if (!isMounted || !isInitialized.current || isUpdatingFromUrl.current) return;
    if (savedExpandedKeys.current.length === 0 || reportData.length === 0) return;

    const restoreRows = async () => {
      const keysToRestore = savedExpandedKeys.current;
      savedExpandedKeys.current = [];

      const { findRowByKey, sortKeysByDepth } = await import('@/lib/treeUtils');
      const sortedKeys = sortKeysByDepth(keysToRestore);

      const keysByDepth = new Map<number, string[]>();
      for (const key of sortedKeys) {
        const depth = key.split('::').length - 1;
        if (!keysByDepth.has(depth)) {
          keysByDepth.set(depth, []);
        }
        keysByDepth.get(depth)!.push(key);
      }

      const depths = Array.from(keysByDepth.keys()).sort((a, b) => a - b);
      const allValidKeys: string[] = [];

      for (const depth of depths) {
        const keysAtDepth = keysByDepth.get(depth)!;
        const rowsToLoad: Array<{ key: string; row: any }> = [];
        const state = useDashboardStore.getState();

        for (const key of keysAtDepth) {
          const currentData = useDashboardStore.getState().reportData;
          const row = findRowByKey(currentData, key);

          if (row) {
            allValidKeys.push(key);
            if (row.hasChildren && (!row.children || row.children.length === 0)) {
              rowsToLoad.push({ key, row });
            }
          }
        }

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

            return fetchDashboardData({
              dateRange: state.loadedDateRange,
              dimensions: state.loadedDimensions,
              depth: row.depth + 1,
              parentFilters,
              sortBy: state.sortColumn || 'subscriptions',
              sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
            })
              .then((children) => ({ success: true, key, children }))
              .catch((error) => {
                console.warn(`Failed to restore expanded row ${key}:`, error);
                return { success: false, key, children: [] };
              });
          });

          const results = await Promise.allSettled(childDataPromises);

          const updateTree = (rows: any[]): any[] => {
            return rows.map((row) => {
              for (const result of results) {
                if (result.status === 'fulfilled' && result.value.success && result.value.key === row.key) {
                  return { ...row, children: result.value.children };
                }
              }
              if (row.children && row.children.length > 0) {
                return { ...row, children: updateTree(row.children) };
              }
              return row;
            });
          };

          const currentReportData = useDashboardStore.getState().reportData;
          useDashboardStore.setState({ reportData: updateTree(currentReportData) });

          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      setExpandedRowKeys(allValidKeys);
    };

    restoreRows();
  }, [reportData.length, isMounted, setExpandedRowKeys]);

  // Update URL when store state changes
  useEffect(() => {
    if (!isMounted || !isInitialized.current || isUpdatingFromUrl.current) return;

    setUrlState({
      start: dateRange.start,
      end: dateRange.end,
      expanded: expandedRowKeys.length > 0 ? expandedRowKeys : null,
      sortBy: sortColumn || 'subscriptions',
      sortDir: sortDirection || 'descend',
    });
  }, [
    isMounted,
    dateRange,
    expandedRowKeys,
    sortColumn,
    sortDirection,
    setUrlState,
  ]);
}
