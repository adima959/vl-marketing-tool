import { create } from 'zustand';
import { fetchApprovalRateData } from '@/lib/api/approvalRateClient';
import type { DateRange } from '@/types';
import type {
  TimePeriod,
  TimePeriodColumn,
  ApprovalRateRow,
  ApprovalRateStore,
} from '@/types/approvalRateReport';
import { normalizeError } from '@/lib/types/errors';
import { DEFAULT_APPROVAL_RATE_DIMENSIONS } from '@/config/approvalRateDimensions';

/**
 * Tree utility to find a row by key
 */
function findRowByKey(rows: ApprovalRateRow[], key: string): ApprovalRateRow | undefined {
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

export const useApprovalRateStore = create<ApprovalRateStore>((set, get) => ({
  // Initial state
  timePeriod: 'monthly',
  loadedTimePeriod: 'monthly',
  periodColumns: [],

  dateRange: getDefaultDateRange(),
  loadedDateRange: getDefaultDateRange(),

  dimensions: [...DEFAULT_APPROVAL_RATE_DIMENSIONS],
  loadedDimensions: [...DEFAULT_APPROVAL_RATE_DIMENSIONS],

  reportData: [],
  expandedRowKeys: [],

  sortColumn: null,
  sortDirection: null,

  isLoading: false,
  hasUnsavedChanges: false,
  hasLoadedOnce: false,
  error: null,

  // Actions
  setTimePeriod: (period) => set({ timePeriod: period, hasUnsavedChanges: true }),

  setDateRange: (range) => set({ dateRange: range, hasUnsavedChanges: true }),

  addDimension: (id) => {
    const { dimensions, reportData, loadedDimensions } = get();
    if (!dimensions.includes(id)) {
      const newDimensions = [...dimensions, id];

      // Update hasChildren for all existing rows
      const updateHasChildren = (rows: ApprovalRateRow[], dims: string[]): ApprovalRateRow[] => {
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
      const updateHasChildren = (rows: ApprovalRateRow[], dims: string[]): ApprovalRateRow[] => {
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

  reorderDimensions: (newOrder) => set({ dimensions: newOrder, hasUnsavedChanges: true }),

  setExpandedRowKeys: (keys) => set({ expandedRowKeys: keys }),

  setSort: async (column, direction) => {
    const state = get();
    set({ sortColumn: column, sortDirection: direction });

    // Reload if data has been loaded
    if (state.hasLoadedOnce) {
      set({ isLoading: true, error: null });

      try {
        const { data, periodColumns } = await fetchApprovalRateData({
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
        set({ isLoading: false, error: appError.message });
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

    set({ isLoading: true, error: null, reportData: [] });

    try {
      const { data, periodColumns } = await fetchApprovalRateData({
        dateRange: state.dateRange,
        dimensions: state.dimensions,
        depth: 0,
        timePeriod: state.timePeriod,
        sortBy: state.sortColumn || undefined,
        sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
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
        expandedRowKeys: savedExpandedKeys,
      });

      // Reload child data for expanded rows (if manual reload)
      const isManualReload = state.hasLoadedOnce;
      if (savedExpandedKeys.length > 0 && isManualReload) {
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
          const rowsToLoad: Array<{ key: string; row: ApprovalRateRow }> = [];

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

              return fetchApprovalRateData({
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
                  return { success: false, key, children: [] as ApprovalRateRow[] };
                });
            });

            const results = await Promise.allSettled(childDataPromises);

            // Update tree with all children
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

            set({ reportData: updateTree(get().reportData) });
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }

        if (allValidKeys.length !== savedExpandedKeys.length) {
          set({ expandedRowKeys: allValidKeys });
        }
      }
    } catch (error: unknown) {
      const appError = normalizeError(error);
      console.error('Failed to load data:', appError);
      set({ isLoading: false, error: appError.message });
    }
  },

  loadChildData: async (parentKey: string, _parentValue: string, parentDepth: number) => {
    const state = get();

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

      const { data: children } = await fetchApprovalRateData({
        dateRange: state.loadedDateRange,
        dimensions: state.loadedDimensions,
        depth: parentDepth + 1,
        parentFilters,
        timePeriod: state.loadedTimePeriod,
        sortBy: state.sortColumn || undefined,
        sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
      });

      // Update tree with children
      const updateTree = (rows: ApprovalRateRow[]): ApprovalRateRow[] => {
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

      set({ reportData: updateTree(state.reportData) });
    } catch (error: unknown) {
      const appError = normalizeError(error);
      console.error('Failed to load child data:', appError);
      throw appError;
    }
  },
}));
