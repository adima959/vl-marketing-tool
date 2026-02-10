import { create } from 'zustand';
import { fetchOnPageData } from '@/lib/api/onPageClient';
import type { DateRange } from '@/types';
import type { OnPageReportRow } from '@/types/onPageReport';
import type { TableFilter } from '@/types/filters';
import { normalizeError } from '@/lib/types/errors';

interface OnPageState {
  // Filters
  dateRange: DateRange;
  dimensions: string[];
  filters: TableFilter[];

  // Loaded state
  loadedDimensions: string[];
  loadedDateRange: DateRange;
  loadedFilters: TableFilter[];
  reportData: OnPageReportRow[];

  // UI state
  expandedRowKeys: string[];
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;
  isLoading: boolean;
  isLoadingSubLevels: boolean;
  hasUnsavedChanges: boolean;
  hasLoadedOnce: boolean;
  error: string | null;

  // Actions
  setDateRange: (range: DateRange) => void;
  setFilters: (filters: TableFilter[]) => void;
  addDimension: (id: string) => void;
  removeDimension: (id: string) => void;
  reorderDimensions: (newOrder: string[]) => void;
  setExpandedRowKeys: (keys: string[]) => void;
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  setLoadedDimensions: (dimensions: string[]) => void;
  resetFilters: () => void;
  loadData: () => Promise<void>;
  loadChildData: (parentKey: string, parentValue: string, parentDepth: number) => Promise<void>;
}

const getDefaultDateRange = (): DateRange => {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const useOnPageStore = create<OnPageState>((set, get) => ({
  // Initial state
  dateRange: getDefaultDateRange(),
  dimensions: ['utmSource', 'countryCode', 'urlPath', 'campaign', 'adset', 'ad'],
  filters: [],
  loadedDimensions: ['utmSource', 'countryCode', 'urlPath', 'campaign', 'adset', 'ad'],
  loadedDateRange: getDefaultDateRange(),
  loadedFilters: [],
  reportData: [],
  expandedRowKeys: [],
  sortColumn: 'pageViews',
  sortDirection: 'descend',
  isLoading: false,
  isLoadingSubLevels: false,
  hasUnsavedChanges: false,
  hasLoadedOnce: false,
  error: null,

  // Actions
  setDateRange: (range) => set({ dateRange: range, hasUnsavedChanges: true }),
  setFilters: (filters) => set({ filters, hasUnsavedChanges: true }),

  addDimension: (id) => {
    const { dimensions, reportData, loadedDimensions } = get();
    if (!dimensions.includes(id)) {
      const newDimensions = [...dimensions, id];

      // Update hasChildren for all existing rows based on new dimension count
      const updateHasChildren = (rows: OnPageReportRow[], currentDimensions: string[]): OnPageReportRow[] => {
        return rows.map(row => {
          const newHasChildren = row.depth < currentDimensions.length - 1;
          const updatedRow = { ...row, hasChildren: newHasChildren };

          if (row.children && row.children.length > 0) {
            updatedRow.children = updateHasChildren(row.children, currentDimensions);
          }

          return updatedRow;
        });
      };

      // Only update reportData if it's already been loaded
      if (reportData.length > 0 && loadedDimensions.length > 0) {
        set({
          dimensions: newDimensions,
          hasUnsavedChanges: true,
          reportData: updateHasChildren(reportData, newDimensions)
        });
      } else {
        set({ dimensions: newDimensions, hasUnsavedChanges: true });
      }
    }
  },

  removeDimension: (id) => {
    const { dimensions, reportData, loadedDimensions } = get();
    if (dimensions.length > 1) {
      const newDimensions = dimensions.filter((d) => d !== id);

      // Update hasChildren for all existing rows based on new dimension count
      const updateHasChildren = (rows: OnPageReportRow[], currentDimensions: string[]): OnPageReportRow[] => {
        return rows.map(row => {
          const newHasChildren = row.depth < currentDimensions.length - 1;
          const updatedRow = { ...row, hasChildren: newHasChildren };

          if (row.children && row.children.length > 0) {
            updatedRow.children = updateHasChildren(row.children, currentDimensions);
          }

          return updatedRow;
        });
      };

      // Only update reportData if it's already been loaded
      if (reportData.length > 0 && loadedDimensions.length > 0) {
        set({
          dimensions: newDimensions,
          hasUnsavedChanges: true,
          reportData: updateHasChildren(reportData, newDimensions)
        });
      } else {
        set({ dimensions: newDimensions, hasUnsavedChanges: true });
      }
    }
  },

  reorderDimensions: (newOrder) => set({ dimensions: newOrder, hasUnsavedChanges: true }),

  setExpandedRowKeys: (keys) => set({ expandedRowKeys: keys }),

  setSort: async (column, direction) => {
    const state = get();
    set({ sortColumn: column, sortDirection: direction });

    if (state.hasLoadedOnce) {
      set({ isLoading: true, error: null });
      const apiFilters = state.filters.filter(f => f.value).map(({ field, operator, value }) => ({ field, operator, value }));

      try {
        const data = await fetchOnPageData({
          dateRange: state.dateRange,
          dimensions: state.dimensions,
          depth: 0,
          ...(apiFilters.length > 0 && { filters: apiFilters }),
          sortBy: column || 'pageViews',
          sortDirection: direction === 'ascend' ? 'ASC' : 'DESC',
        });

        set({
          isLoading: false,
          hasUnsavedChanges: false,
          hasLoadedOnce: true,
          loadedDimensions: state.dimensions,
          loadedDateRange: state.dateRange,
          loadedFilters: state.filters,
          reportData: data,
          expandedRowKeys: [], // Clear expanded rows on sort change
        });
      } catch (error: unknown) {
        const appError = normalizeError(error);
        console.error('Failed to load data:', appError);
        set({
          isLoading: false,
          error: appError.message,
        });
      }
    }
  },

  setLoadedDimensions: (dimensions) => set({ dimensions, loadedDimensions: dimensions, hasUnsavedChanges: false }),

  resetFilters: () => {
    const state = get();
    set({
      dateRange: state.loadedDateRange,
      dimensions: state.loadedDimensions,
      filters: state.loadedFilters,
      hasUnsavedChanges: false,
    });
  },

  loadData: async () => {
    const state = get();
    // Save expanded keys to restore after reload
    const savedExpandedKeys = [...state.expandedRowKeys];
    const apiFilters = state.filters.filter(f => f.value).map(({ field, operator, value }) => ({ field, operator, value }));

    set({ isLoading: true, error: null });

    try {
      const data = await fetchOnPageData({
        dateRange: state.dateRange,
        dimensions: state.dimensions,
        depth: 0,
        ...(apiFilters.length > 0 && { filters: apiFilters }),
        sortBy: state.sortColumn || 'pageViews',
        sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
      });

      set({
        isLoading: false,
        hasUnsavedChanges: false,
        hasLoadedOnce: true,
        loadedDimensions: state.dimensions,
        loadedDateRange: state.dateRange,
        loadedFilters: state.filters,
        reportData: data,
        expandedRowKeys: savedExpandedKeys, // Keep expanded state
      });

      // Reload child data for previously expanded rows level-by-level
      if (savedExpandedKeys.length > 0) {
        const { sortKeysByDepth, findRowByKey } = await import('@/lib/treeUtils');
        const sortedKeys = sortKeysByDepth(savedExpandedKeys);

        // Group keys by depth for level-by-level processing
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

        // Process each depth level sequentially
        for (const depth of depths) {
          const keysAtDepth = keysByDepth.get(depth)!;
          const rowsToLoad: Array<{ key: string; row: OnPageReportRow }> = [];

          for (const key of keysAtDepth) {
            const currentData = get().reportData;
            const row = findRowByKey(currentData, key);
            if (row) {
              allValidKeys.push(key);
              if (row.hasChildren) {
                rowsToLoad.push({ key, row });
              }
            }
          }

          // Load all rows at this depth in parallel, then update tree once
          if (rowsToLoad.length > 0) {
            // Fetch all children data in parallel
            const childDataPromises = rowsToLoad.map(({ key, row }) => {
              const keyParts = key.split('::');
              const parentFilters: Record<string, string> = {};
              keyParts.forEach((value, index) => {
                const dimension = state.dimensions[index];  // Use current dimensions, not loaded
                if (dimension) {
                  parentFilters[dimension] = value;
                }
              });

              return fetchOnPageData({
                dateRange: state.dateRange,  // Use current dateRange, not loaded
                dimensions: state.dimensions,  // Use current dimensions, not loaded
                depth: row.depth + 1,
                parentFilters,
                ...(apiFilters.length > 0 && { filters: apiFilters }),
                sortBy: state.sortColumn || 'pageViews',
                sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
              })
                .then((children) => ({ success: true, key, children }))
                .catch((error) => {
                  console.warn(`Failed to reload expanded row ${key}:`, error);
                  return { success: false, key, children: [] };
                });
            });

            const results = await Promise.allSettled(childDataPromises);

            // Update tree once with all children for this depth level
            const updateTree = (rows: OnPageReportRow[]): OnPageReportRow[] => {
              return rows.map((row) => {
                // Check if this row has new children data
                for (const result of results) {
                  if (result.status === 'fulfilled' && result.value.success && result.value.key === row.key) {
                    return { ...row, children: result.value.children };
                  }
                }
                // Recursively update children
                if (row.children && row.children.length > 0) {
                  return { ...row, children: updateTree(row.children) };
                }
                return row;
              });
            };

            set({ reportData: updateTree(get().reportData) });

            // Small delay for state propagation
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }

        // Update to only valid keys (some may not exist after filter change)
        if (allValidKeys.length !== savedExpandedKeys.length) {
          set({ expandedRowKeys: allValidKeys });
        }
      }
    } catch (error: unknown) {
      const appError = normalizeError(error);
      console.error('Failed to load on-page data:', {
        code: appError.code,
        message: appError.message,
      });
      set({
        isLoading: false,
        error: appError.message,
      });
    }
  },

  loadChildData: async (parentKey: string, _parentValue: string, parentDepth: number) => {
    const state = get();
    set({ isLoadingSubLevels: true });

    try {
      const keyParts = parentKey.split('::');
      const parentFilters: Record<string, string> = {};

      keyParts.forEach((value, index) => {
        const dimension = state.loadedDimensions[index];
        if (dimension) {
          parentFilters[dimension] = value;
        }
      });

      const loadedApiFilters = state.loadedFilters.filter(f => f.value).map(({ field, operator, value }) => ({ field, operator, value }));
      const children = await fetchOnPageData({
        dateRange: state.loadedDateRange,
        dimensions: state.loadedDimensions,
        depth: parentDepth + 1,
        parentFilters,
        ...(loadedApiFilters.length > 0 && { filters: loadedApiFilters }),
        sortBy: state.sortColumn || 'pageViews',
        sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
      });

      // Update reportData tree with children
      const updateTree = (rows: OnPageReportRow[]): OnPageReportRow[] => {
        return rows.map((row) => {
          if (row.key === parentKey) {
            return { ...row, children };
          }
          if (row.children && row.children.length > 0) {
            return { ...row, children: updateTree(row.children) };
          }
          return row;
        });
      };

      set({ reportData: updateTree(state.reportData), isLoadingSubLevels: false });
    } catch (error: unknown) {
      set({ isLoadingSubLevels: false });
      const appError = normalizeError(error);
      console.error('Failed to load child data:', {
        code: appError.code,
        message: appError.message,
      });
      throw appError;
    }
  },
}));
