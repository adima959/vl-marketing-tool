import { create } from 'zustand';
import { fetchValidationRateData } from '@/lib/api/validationRateClient';
import type { DateRange } from '@/types';
import type {
  ValidationRateType,
  ValidationRateRow,
  ValidationRateStore,
} from '@/types/validationRate';
import { normalizeError } from '@/lib/types/errors';
import { triggerError } from '@/lib/api/errorHandler';
import { findRowByKey } from '@/lib/treeUtils';
import { DEFAULT_VALIDATION_RATE_DIMENSIONS } from '@/config/validationRateDimensions';

/**
 * Get default date range (last 90 days / 3 months)
 */
const getDefaultDateRange = (): DateRange => {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setDate(start.getDate() - 89); // 90 days total
  start.setHours(0, 0, 0, 0);

  return { start, end };
};

/**
 * Factory function to create a Zustand store for any validation rate type.
 *
 * The rateType is captured in the closure and passed to all API calls.
 * Each call creates a completely independent store with its own state.
 *
 * Usage:
 *   export const usePayRateStore = createValidationRateStore('pay');
 *   export const useBuyRateStore = createValidationRateStore('buy');
 */
export function createValidationRateStore(rateType: ValidationRateType) {
  // Each store gets its own request ID counter (closure-scoped)
  let currentLoadRequestId = 0;

  return create<ValidationRateStore>((set, get) => ({
    // Initial state
    timePeriod: 'biweekly',
    loadedTimePeriod: 'biweekly',
    periodColumns: [],

    dateRange: getDefaultDateRange(),
    loadedDateRange: getDefaultDateRange(),

    dimensions: [...DEFAULT_VALIDATION_RATE_DIMENSIONS],
    loadedDimensions: [...DEFAULT_VALIDATION_RATE_DIMENSIONS],

    reportData: [],
    expandedRowKeys: [],

    sortColumn: null,
    sortDirection: null,

    isLoading: false,
    isLoadingSubLevels: false,
    hasUnsavedChanges: false,
    hasLoadedOnce: false,

    // Actions
    setTimePeriod: (period) => set({ timePeriod: period, hasUnsavedChanges: true }),

    setDateRange: (range) => set({ dateRange: range, hasUnsavedChanges: true }),

    addDimension: (id) => {
      const { dimensions, reportData, loadedDimensions } = get();
      if (!dimensions.includes(id)) {
        const newDimensions = [...dimensions, id];

        // Update hasChildren for all existing rows
        const updateHasChildren = (rows: ValidationRateRow[], dims: string[]): ValidationRateRow[] => {
          return rows.map((row) => {
            const newHasChildren = row.depth < dims.length - 1;
            const updatedRow = { ...row, hasChildren: newHasChildren };
            if (row.children && row.children.length > 0) {
              updatedRow.children = updateHasChildren(row.children, dims);
            }
            return updatedRow;
          });
        };

        if (reportData.length > 0 && loadedDimensions.length > 0) {
          set({
            dimensions: newDimensions,
            hasUnsavedChanges: true,
            reportData: updateHasChildren(reportData, newDimensions),
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

        // Update hasChildren for all existing rows
        const updateHasChildren = (rows: ValidationRateRow[], dims: string[]): ValidationRateRow[] => {
          return rows.map((row) => {
            const newHasChildren = row.depth < dims.length - 1;
            const updatedRow = { ...row, hasChildren: newHasChildren };
            if (row.children && row.children.length > 0) {
              updatedRow.children = updateHasChildren(row.children, dims);
            }
            return updatedRow;
          });
        };

        if (reportData.length > 0 && loadedDimensions.length > 0) {
          set({
            dimensions: newDimensions,
            hasUnsavedChanges: true,
            reportData: updateHasChildren(reportData, newDimensions),
          });
        } else {
          set({ dimensions: newDimensions, hasUnsavedChanges: true });
        }
      }
    },

    reorderDimensions: (newOrder) => {
      set({
        dimensions: newOrder,
        hasUnsavedChanges: true,
        expandedRowKeys: [],  // Clear because key format is tied to dimension order
      });
    },

    setExpandedRowKeys: (keys) => set({ expandedRowKeys: keys }),

    setSort: async (column, direction) => {
      const state = get();
      set({ sortColumn: column, sortDirection: direction });

      // Reload if data has been loaded
      if (state.hasLoadedOnce) {
        set({ isLoading: true });

        try {
          const { data, periodColumns } = await fetchValidationRateData({
            rateType,
            dateRange: state.dateRange,
            dimensions: state.dimensions,
            depth: 0,
            timePeriod: state.timePeriod,
            sortBy: column || undefined,
            sortDirection: direction === 'ascend' ? 'ASC' : 'DESC',
          });

          set({
            isLoading: false,
            hasUnsavedChanges: false,
            hasLoadedOnce: true,
            loadedDimensions: state.dimensions,
            loadedDateRange: state.dateRange,
            loadedTimePeriod: state.timePeriod,
            periodColumns,
            reportData: data,
            expandedRowKeys: [],
          });
        } catch (error: unknown) {
          const appError = normalizeError(error);
          console.error('Failed to load data:', appError);
          triggerError(appError);
          set({ isLoading: false });
        }
      }
    },

    setLoadedDimensions: (dimensions) =>
      set({ dimensions, loadedDimensions: dimensions, hasUnsavedChanges: false }),

    setLoadedDateRange: (range) =>
      set({ dateRange: range, loadedDateRange: range, hasUnsavedChanges: false }),

    setLoadedTimePeriod: (period) =>
      set({ timePeriod: period, loadedTimePeriod: period, hasUnsavedChanges: false }),

    setPeriodColumns: (columns) => set({ periodColumns: columns }),

    setReportData: (data) => set({ reportData: data }),

    resetFilters: () => {
      const state = get();
      set({
        dateRange: state.loadedDateRange,
        dimensions: state.loadedDimensions,
        timePeriod: state.loadedTimePeriod,
        hasUnsavedChanges: false,
      });
    },

    loadData: async () => {
      const state = get();
      const savedExpandedKeys = [...state.expandedRowKeys];

      // Increment request ID to track this specific request
      const requestId = ++currentLoadRequestId;

      set({ isLoading: true, reportData: [] });

      try {
        const { data, periodColumns } = await fetchValidationRateData({
          rateType,
          dateRange: state.dateRange,
          dimensions: state.dimensions,
          depth: 0,
          timePeriod: state.timePeriod,
          sortBy: state.sortColumn || undefined,
          sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
        });

        // Ignore stale response if a newer request was made
        if (requestId !== currentLoadRequestId) {
          return;
        }

        set({
          isLoading: false,
          hasUnsavedChanges: false,
          hasLoadedOnce: true,
          loadedDimensions: state.dimensions,
          loadedDateRange: state.dateRange,
          loadedTimePeriod: state.timePeriod,
          periodColumns,
          reportData: data,
          expandedRowKeys: savedExpandedKeys,
        });

        // Reload child data for expanded rows (if manual reload)
        const isManualReload = state.hasLoadedOnce;
        if (savedExpandedKeys.length > 0 && isManualReload) {
          set({ isLoadingSubLevels: true });
          // Group keys by depth
          const keysByDepth = new Map<number, string[]>();
          for (const key of savedExpandedKeys) {
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
            const rowsToLoad: Array<{ key: string; row: ValidationRateRow }> = [];

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

            // Load all rows at this depth in parallel
            if (rowsToLoad.length > 0) {
              const childDataPromises = rowsToLoad.map(({ key, row }) => {
                const keyParts = key.split('::');
                const parentFilters: Record<string, string> = {};
                keyParts.forEach((value, index) => {
                  const dimension = state.dimensions[index];
                  if (dimension) {
                    parentFilters[dimension] = value;
                  }
                });

                return fetchValidationRateData({
                  rateType,
                  dateRange: state.dateRange,
                  dimensions: state.dimensions,
                  depth: row.depth + 1,
                  parentFilters,
                  timePeriod: state.timePeriod,
                  sortBy: state.sortColumn || undefined,
                  sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
                })
                  .then(({ data: children }) => ({ success: true, key, children }))
                  .catch((error) => {
                    console.warn(`Failed to reload expanded row ${key}:`, error);
                    return { success: false, key, children: [] as ValidationRateRow[] };
                  });
              });

              const results = await Promise.allSettled(childDataPromises);

              // Update tree with all children
              const updateTree = (rows: ValidationRateRow[]): ValidationRateRow[] => {
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

              // Check staleness before updating
              if (requestId !== currentLoadRequestId) return;
              set({ reportData: updateTree(get().reportData) });
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          }

          // Check staleness before final update
          if (requestId !== currentLoadRequestId) return;
          if (allValidKeys.length !== savedExpandedKeys.length) {
            set({ expandedRowKeys: allValidKeys });
          }
          set({ isLoadingSubLevels: false });
        }
      } catch (error: unknown) {
        // Ignore errors from stale requests
        if (requestId !== currentLoadRequestId) {
          return;
        }
        const appError = normalizeError(error);
        console.error('Failed to load data:', appError);
        triggerError(appError);
        set({ isLoading: false });
      }
    },

    loadChildData: async (parentKey: string, _parentValue: string, parentDepth: number) => {
      const state = get();
      set({ isLoadingSubLevels: true });

      try {
        // Build parent filter chain from key hierarchy
        const keyParts = parentKey.split('::');
        const parentFilters: Record<string, string> = {};

        keyParts.forEach((value, index) => {
          const dimension = state.loadedDimensions[index];
          if (dimension) {
            parentFilters[dimension] = value;
          }
        });

        const { data: children } = await fetchValidationRateData({
          rateType,
          dateRange: state.loadedDateRange,
          dimensions: state.loadedDimensions,
          depth: parentDepth + 1,
          parentFilters,
          timePeriod: state.loadedTimePeriod,
          sortBy: state.sortColumn || undefined,
          sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
        });

        // Update tree with children
        const updateTree = (rows: ValidationRateRow[]): ValidationRateRow[] => {
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
        console.error('Failed to load child data:', appError);
        throw appError;
      }
    },
  }));
}
