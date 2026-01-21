import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useReportStore } from '@/stores/reportStore';
import { useUrlState } from './useUrlState';

/**
 * Simplified hook to sync Zustand store state with URL query parameters
 * This enables sharing and bookmarking of dashboard state
 */
export function useUrlSync() {
  const router = useRouter();
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
      let shouldLoadData = false;

      // Parse and apply date range
      const urlDateRange = urlState.getDateRangeFromUrl();
      if (urlDateRange) {
        // Directly update store without triggering hasUnsavedChanges
        useReportStore.setState({ dateRange: urlDateRange });
        shouldLoadData = true;
      }

      // Parse and apply dimensions
      const urlDimensions = urlState.getDimensionsFromUrl();
      if (urlDimensions) {
        // Directly update store without triggering hasUnsavedChanges
        useReportStore.setState({ dimensions: urlDimensions });
        shouldLoadData = true;
      }

      // Save expanded keys for later restoration
      const urlExpandedKeys = urlState.getExpandedKeysFromUrl();
      if (urlExpandedKeys) {
        savedExpandedKeys.current = urlExpandedKeys;
        shouldLoadData = true;
      }

      // Parse and apply sort
      const urlSort = urlState.getSortFromUrl();
      if (urlSort.column) {
        setSort(urlSort.column, urlSort.direction);
        shouldLoadData = true;
      }

      // Auto-load if we have URL params
      if (shouldLoadData) {
        // Use queueMicrotask instead of setTimeout(0) for better performance
        queueMicrotask(() => {
          loadData();
        });
      }
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

    // Update URL without navigation
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    router.replace(newUrl, { scroll: false });
  }, [
    isMounted,
    dateRange,
    dimensions,
    expandedRowKeys,
    sortColumn,
    sortDirection,
    router,
  ]);
}
