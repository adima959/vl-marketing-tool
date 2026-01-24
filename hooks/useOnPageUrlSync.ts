import { useEffect, useRef, useState } from 'react';
import { useOnPageStore } from '@/stores/onPageStore';
import { useUrlState } from './useUrlState';

/**
 * Hook to sync on-page analysis store state with URL query parameters
 */
export function useOnPageUrlSync() {
  const urlState = useUrlState();
  const isInitialized = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  const savedExpandedKeys = useRef<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

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
  } = useOnPageStore();

  // Initialize state from URL on mount
  useEffect(() => {
    if (!isMounted || isInitialized.current) return;

    isInitialized.current = true;
    isUpdatingFromUrl.current = true;

    try {
      let shouldLoadData = false;

      const urlDateRange = urlState.getDateRangeFromUrl();
      if (urlDateRange) {
        useOnPageStore.setState({ dateRange: urlDateRange });
        shouldLoadData = true;
      }

      const urlDimensions = urlState.getDimensionsFromUrl();
      if (urlDimensions) {
        useOnPageStore.setState({ dimensions: urlDimensions });
        shouldLoadData = true;
      }

      const urlExpandedKeys = urlState.getExpandedKeysFromUrl();
      if (urlExpandedKeys) {
        savedExpandedKeys.current = urlExpandedKeys;
        shouldLoadData = true;
      }

      const urlSort = urlState.getSortFromUrl();
      if (urlSort.column) {
        setSort(urlSort.column, urlSort.direction);
        shouldLoadData = true;
      }

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
      savedExpandedKeys.current = [];

      const { findRowByKey, sortKeysByDepth } = await import('@/lib/treeUtils');
      const sortedKeys = sortKeysByDepth(keysToRestore);
      const expandedKeys: string[] = [];

      for (const key of sortedKeys) {
        const currentData = useOnPageStore.getState().reportData;
        const row = findRowByKey(currentData, key);

        if (row) {
          expandedKeys.push(key);
          setExpandedRowKeys([...expandedKeys]);

          if (row.hasChildren && (!row.children || row.children.length === 0)) {
            try {
              await loadChildData(key, row.attribute, row.depth);
              await new Promise((resolve) => setTimeout(resolve, 100));
            } catch (error) {
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

    params.set('start', dateRange.start.toISOString().split('T')[0]);
    params.set('end', dateRange.end.toISOString().split('T')[0]);

    if (dimensions.length > 0) {
      params.set('dimensions', dimensions.join(','));
    }

    if (expandedRowKeys.length > 0) {
      params.set('expanded', expandedRowKeys.join(','));
    }

    if (sortColumn) {
      params.set('sortBy', sortColumn);
      if (sortDirection) {
        params.set('sortDir', sortDirection);
      }
    }

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
