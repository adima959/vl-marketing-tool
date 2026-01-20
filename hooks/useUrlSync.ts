import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useReportStore } from '@/stores/reportStore';

/**
 * Hook to sync Zustand store state with URL query parameters
 * This enables sharing and bookmarking of dashboard state
 */
export function useUrlSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    setDateRange,
    reorderDimensions,
    setExpandedRowKeys,
    setSort,
    loadData,
    loadChildData,
  } = useReportStore();

  // Initialize state from URL on mount
  useEffect(() => {
    if (!isMounted) return;
    if (isInitialized.current) return;
    isInitialized.current = true;
    isUpdatingFromUrl.current = true;

    let shouldLoadData = false;
    let hasUrlParams = false;

    try {
      // Parse date range from URL
      const startDate = searchParams.get('start');
      const endDate = searchParams.get('end');
      if (startDate && endDate) {
        setDateRange({
          start: new Date(startDate),
          end: new Date(endDate),
        });
        hasUrlParams = true;
      }

      // Parse dimensions from URL
      const dimensionsParam = searchParams.get('dimensions');
      if (dimensionsParam) {
        const dims = dimensionsParam.split(',');
        if (dims.length > 0) {
          reorderDimensions(dims);
          hasUrlParams = true;
        }
      }

      // Parse expanded rows from URL (save for later restoration)
      const expandedParam = searchParams.get('expanded');
      if (expandedParam) {
        const expanded = expandedParam.split(',');
        savedExpandedKeys.current = expanded;
        hasUrlParams = true;
      }

      // Parse sort from URL
      const sortCol = searchParams.get('sortBy');
      const sortDir = searchParams.get('sortDir');
      if (sortCol) {
        setSort(
          sortCol,
          sortDir === 'ascend' || sortDir === 'descend' ? sortDir : null
        );
        hasUrlParams = true;
      }

      // If we have URL params, automatically load the data
      if (hasUrlParams) {
        shouldLoadData = true;
      }
    } finally {
      isUpdatingFromUrl.current = false;
    }

    // Load data after state is initialized
    if (shouldLoadData) {
      setTimeout(() => {
        loadData();
      }, 0);
    }
  }, [isMounted, searchParams, setDateRange, reorderDimensions, setExpandedRowKeys, setSort, loadData]);

  // Restore expanded rows after data loads
  useEffect(() => {
    if (!isMounted) return;
    if (!isInitialized.current || isUpdatingFromUrl.current) return;
    if (savedExpandedKeys.current.length === 0) return;
    if (reportData.length === 0) return;

    const restoreExpandedRows = async () => {
      const keysToRestore = savedExpandedKeys.current;
      savedExpandedKeys.current = []; // Clear to prevent re-running

      // Sort keys by depth (number of '::' separators) to load parents before children
      const sortedKeys = keysToRestore.sort((a, b) => {
        const depthA = (a.match(/::/g) || []).length;
        const depthB = (b.match(/::/g) || []).length;
        return depthA - depthB;
      });

      // Helper to find a row by key in the current reportData
      const findRow = (rows: any[], targetKey: string): any => {
        for (const row of rows) {
          if (row.key === targetKey) return row;
          if (row.children) {
            const found = findRow(row.children, targetKey);
            if (found) return found;
          }
        }
        return null;
      };

      // Process keys level by level
      const expandedKeys: string[] = [];

      for (const key of sortedKeys) {
        // Wait a bit to let the store update propagate
        await new Promise(resolve => setTimeout(resolve, 50));

        // Get fresh data from store each iteration
        const currentData = useReportStore.getState().reportData;
        const row = findRow(currentData, key);

        if (row) {
          // Add to expanded keys
          expandedKeys.push(key);
          setExpandedRowKeys([...expandedKeys]);

          // Load children if needed
          if (row.hasChildren && (!row.children || row.children.length === 0)) {
            await loadChildData(key, row.attribute, row.depth);
            // Wait for data to be loaded and state to update
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
    };

    restoreExpandedRows();
  }, [isMounted, reportData, loadChildData, setExpandedRowKeys, isUpdatingFromUrl]);

  // Update URL when store state changes
  useEffect(() => {
    if (!isMounted) return;
    if (!isInitialized.current || isUpdatingFromUrl.current) return;

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
