import { useEffect, useRef, useState } from 'react';
import {
  useQueryStates,
  parseAsIsoDate,
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import { useApprovalRateStore } from '@/stores/approvalRateStore';
import { fetchApprovalRateData } from '@/lib/api/approvalRateClient';
import type { ApprovalRateRow, TimePeriod } from '@/types';
import {
  DEFAULT_APPROVAL_RATE_DIMENSIONS,
  APPROVAL_RATE_DIMENSION_COLUMN_MAP,
} from '@/config/approvalRateDimensions';

/**
 * Find a row by key in the tree
 */
function findRowByKey(
  rows: ApprovalRateRow[],
  key: string
): ApprovalRateRow | undefined {
  for (const row of rows) {
    if (row.key === key) return row;
    if (row.children) {
      const found = findRowByKey(row.children, key);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Sort keys by depth (shallowest first)
 */
function sortKeysByDepth(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const depthA = a.split('::').length;
    const depthB = b.split('::').length;
    return depthA - depthB;
  });
}

/**
 * Get default date range (90 days / 3 months)
 */
function getDefaultDateRange(): Date {
  const today = new Date();
  today.setDate(today.getDate() - 90);
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Hook to sync approval rate store state with URL query parameters
 * Enables sharing and bookmarking of dashboard state
 */
export function useApprovalRateUrlSync() {
  // URL parsers with defaults
  const urlParsers = {
    start: parseAsIsoDate.withDefault(getDefaultDateRange()),
    end: parseAsIsoDate.withDefault(new Date()),
    dimensions: parseAsArrayOf(parseAsString).withDefault(DEFAULT_APPROVAL_RATE_DIMENSIONS),
    expanded: parseAsArrayOf(parseAsString).withDefault([]),
    period: parseAsStringLiteral(['weekly', 'biweekly', 'monthly'] as const).withDefault('monthly'),
    sortBy: parseAsString.withDefault(''),
    sortDir: parseAsStringLiteral(['ascend', 'descend'] as const).withDefault('descend'),
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
    expandedRowKeys,
    sortColumn,
    sortDirection,
    timePeriod,
    reportData,
    setSort,
    loadData,
    setExpandedRowKeys,
  } = useApprovalRateStore();

  const store = useApprovalRateStore;

  // Initialize state from URL on mount
  useEffect(() => {
    if (!isMounted || isInitialized.current) return;

    isInitialized.current = true;
    isUpdatingFromUrl.current = true;

    try {
      // Apply date range from URL
      if (urlState.start && urlState.end) {
        store.setState({
          dateRange: { start: urlState.start, end: urlState.end },
        });
      }

      // Apply dimensions from URL (filter to only valid approval rate dimensions)
      if (urlState.dimensions && urlState.dimensions.length > 0) {
        const validDimensions = urlState.dimensions.filter(
          (d) => d in APPROVAL_RATE_DIMENSION_COLUMN_MAP
        );
        store.setState({
          dimensions: validDimensions.length > 0 ? validDimensions : DEFAULT_APPROVAL_RATE_DIMENSIONS,
        });
      }

      // Apply time period from URL
      if (urlState.period) {
        store.setState({ timePeriod: urlState.period as TimePeriod });
      }

      // Save expanded keys for later restoration
      if (urlState.expanded && urlState.expanded.length > 0) {
        savedExpandedKeys.current = urlState.expanded;
      }

      // Apply sort from URL
      if (urlState.sortBy) {
        setSort(urlState.sortBy, urlState.sortDir || 'descend');
      }

      // Load data on mount
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
    if (hasRestoredOnce.current) return;
    if (savedExpandedKeys.current.length === 0 || reportData.length === 0) return;

    const restoreRows = async () => {
      hasRestoredOnce.current = true;
      const keysToRestore = savedExpandedKeys.current;
      savedExpandedKeys.current = [];

      const sortedKeys = sortKeysByDepth(keysToRestore);

      // Group keys by depth
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

      // Process each depth level
      for (const depth of depths) {
        const keysAtDepth = keysByDepth.get(depth)!;
        const rowsToLoad: Array<{ key: string; row: ApprovalRateRow }> = [];
        const state = store.getState();

        for (const key of keysAtDepth) {
          const currentData = store.getState().reportData;
          const row = findRowByKey(currentData, key);

          if (row) {
            allValidKeys.push(key);
            if (row.hasChildren && (!row.children || row.children.length === 0)) {
              rowsToLoad.push({ key, row });
            }
          }
        }

        // Fetch children in parallel
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

            return fetchApprovalRateData({
              dateRange: state.loadedDateRange,
              dimensions: state.loadedDimensions,
              depth: row.depth + 1,
              parentFilters,
              timePeriod: state.loadedTimePeriod,
              sortBy: state.sortColumn || undefined,
              sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
            })
              .then(({ data: children }) => ({ success: true, key, children }))
              .catch((error) => {
                console.warn(`Failed to restore expanded row ${key}:`, error);
                return { success: false, key, children: [] as ApprovalRateRow[] };
              });
          });

          const results = await Promise.allSettled(childDataPromises);

          // Update tree with children
          const updateTree = (rows: ApprovalRateRow[]): ApprovalRateRow[] => {
            return rows.map((row) => {
              for (const result of results) {
                if (
                  result.status === 'fulfilled' &&
                  result.value.success &&
                  result.value.key === row.key
                ) {
                  return { ...row, children: result.value.children };
                }
              }
              if (row.children && row.children.length > 0) {
                return { ...row, children: updateTree(row.children) };
              }
              return row;
            });
          };

          const currentReportData = store.getState().reportData;
          store.setState({ reportData: updateTree(currentReportData) });

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
      dimensions: dimensions.length > 0 ? dimensions : null,
      expanded: expandedRowKeys.length > 0 ? expandedRowKeys : null,
      period: timePeriod,
      sortBy: sortColumn || null,
      sortDir: sortDirection || 'descend',
    });
  }, [
    isMounted,
    dateRange,
    dimensions,
    expandedRowKeys,
    sortColumn,
    sortDirection,
    timePeriod,
    setUrlState,
  ]);
}
