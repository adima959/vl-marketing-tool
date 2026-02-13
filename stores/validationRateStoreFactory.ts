import { create } from 'zustand';
import { fetchValidationRateData } from '@/lib/api/validationRateClient';
import type { DateRange } from '@/types';
import type {
  ValidationRateType,
  ValidationRateRow,
  ValidationRateStore,
} from '@/types/validationRate';
import { handleStoreError } from '@/lib/api/errorHandler';
import {
  updateHasChildren,
  updateTreeChildren,
  parseKeyToParentFilters,
  restoreExpandedRows,
} from '@/lib/utils/treeUtils';
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

/** Convert store sort direction to API format */
function apiSortDir(dir: 'ascend' | 'descend' | null): 'ASC' | 'DESC' {
  return dir === 'ascend' ? 'ASC' : 'DESC';
}

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

        if (reportData.length > 0 && loadedDimensions.length > 0) {
          set({
            dimensions: newDimensions,
            hasUnsavedChanges: true,
            reportData: updateHasChildren(reportData, newDimensions.length),
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

        if (reportData.length > 0 && loadedDimensions.length > 0) {
          set({
            dimensions: newDimensions,
            hasUnsavedChanges: true,
            reportData: updateHasChildren(reportData, newDimensions.length),
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
            sortDirection: apiSortDir(direction),
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
          handleStoreError('load data', error);
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
      const isStale = () => requestId !== currentLoadRequestId;

      set({ isLoading: true, reportData: [] });

      try {
        const { data, periodColumns } = await fetchValidationRateData({
          rateType,
          dateRange: state.dateRange,
          dimensions: state.dimensions,
          depth: 0,
          timePeriod: state.timePeriod,
          sortBy: state.sortColumn || undefined,
          sortDirection: apiSortDir(state.sortDirection),
        });

        // Ignore stale response if a newer request was made
        if (isStale()) return;

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

          const { updatedData, validKeys } = await restoreExpandedRows<ValidationRateRow>({
            savedExpandedKeys,
            reportData: data,
            dimensions: state.dimensions,
            fetchChildren: async (parentFilters, depth) => {
              const { data: children } = await fetchValidationRateData({
                rateType,
                dateRange: state.dateRange,
                dimensions: state.dimensions,
                depth,
                parentFilters,
                timePeriod: state.timePeriod,
                sortBy: state.sortColumn || undefined,
                sortDirection: apiSortDir(state.sortDirection),
              });
              return children;
            },
          });

          // Check staleness before applying results
          if (isStale()) return;

          set({
            reportData: updatedData,
            expandedRowKeys: validKeys,
            isLoadingSubLevels: false,
          });
        }
      } catch (error: unknown) {
        // Ignore errors from stale requests
        if (isStale()) return;
        handleStoreError('load data', error);
        set({ isLoading: false });
      }
    },

    loadChildData: async (parentKey: string, _parentValue: string, parentDepth: number) => {
      const state = get();
      set({ isLoadingSubLevels: true });

      try {
        const parentFilters = parseKeyToParentFilters(parentKey, state.loadedDimensions);
        const { data: children } = await fetchValidationRateData({
          rateType,
          dateRange: state.loadedDateRange,
          dimensions: state.loadedDimensions,
          depth: parentDepth + 1,
          parentFilters,
          timePeriod: state.loadedTimePeriod,
          sortBy: state.sortColumn || undefined,
          sortDirection: apiSortDir(state.sortDirection),
        });

        set({
          reportData: updateTreeChildren(state.reportData, parentKey, children),
          isLoadingSubLevels: false,
        });
      } catch (error: unknown) {
        set({ isLoadingSubLevels: false });
        // Re-throw error so UI can handle it with toast
        throw error;
      }
    },
  }));
}
