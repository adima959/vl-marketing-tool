import { useEffect, useRef, useState } from 'react';
import { useReportStore } from '@/stores/reportStore';
import { useUrlState } from './useUrlState';

/**
 * Simplified hook to sync Zustand store state with URL query parameters
 * This enables sharing and bookmarking of dashboard state
 */
export function useUrlSync() {
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
    loadChildData,
  } = useReportStore();

  // Initialize state from URL on mount
  useEffect(() => {
    if (!isMounted || isInitialized.current) return;

    isInitialized.current = true;
    isUpdatingFromUrl.current = true;

    try {
      // Parse and apply date range
      const urlDateRange = urlState.getDateRangeFromUrl();
      if (urlDateRange) {
        useReportStore.setState({ dateRange: urlDateRange });
      }

      // Parse and apply dimensions
      const urlDimensions = urlState.getDimensionsFromUrl();
      if (urlDimensions) {
        useReportStore.setState({ dimensions: urlDimensions });
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
  }, [isMounted]);

  // Restore expanded rows after data loads
  useEffect(() => {
    if (!isMounted || !isInitialized.current || isUpdatingFromUrl.current) return;
    if (savedExpandedKeys.current.length === 0 || reportData.length === 0) return;

    const restoreRows = async () => {
      const keysToRestore = savedExpandedKeys.current;
      savedExpandedKeys.current = []; // Clear to prevent re-running

      // Import dynamically to avoid circular deps
      const { findRowByKey, sortKeysByDepth } = await import('@/lib/treeUtils');
      const sortedKeys = sortKeysByDepth(keysToRestore);
      const expandedKeys: string[] = [];

      for (const key of sortedKeys) {
        const currentData = useReportStore.getState().reportData;
        const row = findRowByKey(currentData, key);

        if (row) {
          expandedKeys.push(key);
          setExpandedRowKeys([...expandedKeys]);

          if (row.hasChildren && (!row.children || row.children.length === 0)) {
            try {
              await loadChildData(key, row.attribute, row.depth);
              // Small delay for state propagation
              await new Promise((resolve) => setTimeout(resolve, 100));
            } catch (error) {
              // Skip this row on error, but continue with others
              console.warn(`Failed to restore expanded row ${key}:`, error);
            }
          }
        }
      }
    };

    restoreRows();
  }, [reportData.length, isMounted]);

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
