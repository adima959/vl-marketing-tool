import { create } from 'zustand';
import { fetchDashboardData } from '@/lib/api/dashboardClient';
import type { DateRange, DashboardRow } from '@/types/dashboard';
import { normalizeError } from '@/lib/types/errors';
import { findRowByKey } from '@/lib/treeUtils';

interface DashboardState {
  // Filters
  dateRange: DateRange;
  dimensions: string[];

  // Loaded state
  loadedDimensions: string[];
  loadedDateRange: DateRange;
  reportData: DashboardRow[];

  // UI state
  expandedRowKeys: string[];
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  hasLoadedOnce: boolean;
  error: string | null;

  // Actions
  setDateRange: (range: DateRange) => void;
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
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  return { start: today, end };
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  // Initial state
  dateRange: getDefaultDateRange(),
  dimensions: ['country', 'product'],
  loadedDimensions: ['country', 'product'],
  loadedDateRange: getDefaultDateRange(),
  reportData: [],
  expandedRowKeys: [],
  sortColumn: 'subscriptions',
  sortDirection: 'descend',
  isLoading: false,
  hasUnsavedChanges: false,
  hasLoadedOnce: false,
  error: null,

  // Actions
  setDateRange: (range) => set({ dateRange: range, hasUnsavedChanges: true }),

  addDimension: (id) => {
    const { dimensions, reportData, loadedDimensions } = get();
    if (!dimensions.includes(id)) {
      const newDimensions = [...dimensions, id];

      const updateHasChildren = (rows: DashboardRow[], currentDimensions: string[]): DashboardRow[] => {
        return rows.map(row => {
          const newHasChildren = row.depth < currentDimensions.length - 1;
          const updatedRow = { ...row, hasChildren: newHasChildren };

          if (row.children && row.children.length > 0) {
            updatedRow.children = updateHasChildren(row.children, currentDimensions);
          }

          return updatedRow;
        });
      };

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

      const updateHasChildren = (rows: DashboardRow[], currentDimensions: string[]): DashboardRow[] => {
        return rows.map(row => {
          const newHasChildren = row.depth < currentDimensions.length - 1;
          const updatedRow = { ...row, hasChildren: newHasChildren };

          if (row.children && row.children.length > 0) {
            updatedRow.children = updateHasChildren(row.children, currentDimensions);
          }

          return updatedRow;
        });
      };

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

      try {
        const data = await fetchDashboardData({
          dateRange: state.dateRange,
          dimensions: state.dimensions,
          depth: 0,
          sortBy: column || 'subscriptions',
          sortDirection: direction === 'ascend' ? 'ASC' : 'DESC',
        });

        set({
          isLoading: false,
          hasUnsavedChanges: false,
          hasLoadedOnce: true,
          loadedDimensions: state.dimensions,
          loadedDateRange: state.dateRange,
          reportData: data,
          expandedRowKeys: [],
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
      hasUnsavedChanges: false,
    });
  },

  loadData: async () => {
    const state = get();
    const savedExpandedKeys = [...state.expandedRowKeys];

    set({ isLoading: true, error: null });

    try {
      const data = await fetchDashboardData({
        dateRange: state.dateRange,
        dimensions: state.dimensions,
        depth: 0,
        sortBy: state.sortColumn || 'subscriptions',
        sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
      });

      set({
        isLoading: false,
        hasUnsavedChanges: false,
        hasLoadedOnce: true,
        loadedDimensions: state.dimensions,
        loadedDateRange: state.dateRange,
        reportData: data,
        expandedRowKeys: savedExpandedKeys,
      });

      if (savedExpandedKeys.length > 0) {
        const { sortKeysByDepth, findRowByKey } = await import('@/lib/treeUtils');
        const sortedKeys = sortKeysByDepth(savedExpandedKeys);

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
          const rowsToLoad: Array<{ key: string; row: DashboardRow }> = [];

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

              return fetchDashboardData({
                dateRange: state.dateRange,
                dimensions: state.dimensions,
                depth: row.depth + 1,
                parentFilters,
                sortBy: state.sortColumn || 'subscriptions',
                sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
              })
                .then((children) => ({ success: true, key, children }))
                .catch((error) => {
                  console.warn(`Failed to reload expanded row ${key}:`, error);
                  return { success: false, key, children: [] };
                });
            });

            const results = await Promise.allSettled(childDataPromises);

            const updateTree = (rows: DashboardRow[]): DashboardRow[] => {
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
      console.error('Failed to load data:', {
        code: appError.code,
        message: appError.message,
      });
      set({
        isLoading: false,
        error: appError.message,
      });
    }
  },

  loadChildData: async (parentKey: string, parentValue: string, parentDepth: number) => {
    const state = get();

    try {
      const keyParts = parentKey.split('::');
      const parentFilters: Record<string, string> = {};

      keyParts.forEach((value, index) => {
        const dimension = state.loadedDimensions[index];
        if (dimension) {
          parentFilters[dimension] = value;
        }
      });

      const children = await fetchDashboardData({
        dateRange: state.loadedDateRange,
        dimensions: state.loadedDimensions,
        depth: parentDepth + 1,
        parentFilters,
        sortBy: state.sortColumn || 'subscriptions',
        sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
      });

      const updateTree = (rows: DashboardRow[]): DashboardRow[] => {
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
      console.error('Failed to load child data:', {
        code: appError.code,
        message: appError.message,
      });
      throw appError;
    }
  },
}));
