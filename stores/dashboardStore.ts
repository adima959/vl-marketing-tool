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
  isLoadingSubLevels: boolean;
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

const getDefaultDimensions = (): string[] => {
  return ['country', 'product', 'source'];
};

const getInitialDimensions = (): string[] => {
  return getDefaultDimensions();
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  // Initial state
  dateRange: getDefaultDateRange(),
  dimensions: getInitialDimensions(),
  loadedDimensions: getInitialDimensions(),
  loadedDateRange: getDefaultDateRange(),
  reportData: [],
  expandedRowKeys: [],
  sortColumn: 'subscriptions',
  sortDirection: 'descend',
  isLoading: false,
  isLoadingSubLevels: false,
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

  reorderDimensions: (newOrder) => {
    set({ dimensions: newOrder, hasUnsavedChanges: true });
  },

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

    // Check if dimensions have changed - if so, treat as fresh load
    const dimensionsChanged =
      state.dimensions.length !== state.loadedDimensions.length ||
      state.dimensions.some((dim, i) => dim !== state.loadedDimensions[i]);

    set({ isLoading: true, error: null });

    try {
      // Load depth 0 (countries)
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
        expandedRowKeys: dimensionsChanged ? [] : savedExpandedKeys,
      });

      // Auto-expand all 3 levels if this is a fresh load or dimensions changed
      if ((savedExpandedKeys.length === 0 || dimensionsChanged) && data.length > 0) {
        const allExpandedKeys: string[] = [];
        let currentReportData = data;

        // Collect depth 0 keys that will be expanded
        for (const row of data) {
          if (row.hasChildren) {
            allExpandedKeys.push(row.key);
          }
        }

        // Set loading state and expanded keys early so skeleton rows can show
        set({ isLoadingSubLevels: true, expandedRowKeys: [...allExpandedKeys] });

        // Load depth 1 (products) for all countries
        const depth1Promises = data.map((countryRow) => {
          if (countryRow.hasChildren) {
            allExpandedKeys.push(countryRow.key);
            const parentFilters: Record<string, string> = {
              [state.dimensions[0]]: countryRow.attribute,
            };

            return fetchDashboardData({
              dateRange: state.dateRange,
              dimensions: state.dimensions,
              depth: 1,
              parentFilters,
              sortBy: state.sortColumn || 'subscriptions',
              sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
            })
              .then((children) => ({ success: true, key: countryRow.key, children }))
              .catch((error) => {
                console.warn(`Failed to load products for ${countryRow.key}:`, error);
                return { success: false, key: countryRow.key, children: [] };
              });
          }
          return Promise.resolve({ success: false, key: countryRow.key, children: [] });
        });

        const depth1Results = await Promise.allSettled(depth1Promises);

        // Update tree with depth 1 data (products)
        const updateTreeDepth1 = (rows: DashboardRow[]): DashboardRow[] => {
          return rows.map((row) => {
            for (const result of depth1Results) {
              if (result.status === 'fulfilled' && result.value.success && result.value.key === row.key) {
                return { ...row, children: result.value.children };
              }
            }
            return row;
          });
        };

        currentReportData = updateTreeDepth1(currentReportData);

        // Collect all depth 1 rows that have children (for loading depth 2)
        const depth1RowsWithChildren: DashboardRow[] = [];
        for (const result of depth1Results) {
          if (result.status === 'fulfilled' && result.value.success) {
            for (const productRow of result.value.children) {
              if (productRow.hasChildren) {
                allExpandedKeys.push(productRow.key);
                depth1RowsWithChildren.push(productRow);
              }
            }
          }
        }

        // Update state with depth 1 data and expanded keys so skeletons show for depth 2
        set({ reportData: currentReportData, expandedRowKeys: [...allExpandedKeys] });

        // Load depth 2 data for all depth 1 rows
        const depth2Promises = depth1RowsWithChildren.map((row) => {
          const keyParts = row.key.split('::');
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
            depth: 2,
            parentFilters,
            sortBy: state.sortColumn || 'subscriptions',
            sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
          })
            .then((children) => ({ success: true, key: row.key, children }))
            .catch((error) => {
              console.warn(`Failed to load depth 2 for ${row.key}:`, error);
              return { success: false, key: row.key, children: [] };
            });
        });

        const depth2Results = await Promise.allSettled(depth2Promises);

        // Update tree with depth 2 data
        const updateTreeDepth2 = (rows: DashboardRow[]): DashboardRow[] => {
          return rows.map((row) => {
            // Check if this row's children need updating
            if (row.children && row.children.length > 0) {
              const updatedChildren = row.children.map((child) => {
                for (const result of depth2Results) {
                  if (result.status === 'fulfilled' && result.value.success && result.value.key === child.key) {
                    return { ...child, children: result.value.children };
                  }
                }
                return child;
              });
              return { ...row, children: updatedChildren };
            }
            return row;
          });
        };

        currentReportData = updateTreeDepth2(currentReportData);

        set({ reportData: currentReportData, expandedRowKeys: allExpandedKeys, isLoadingSubLevels: false });
      }
      // If there are saved expanded keys, restore them
      else if (savedExpandedKeys.length > 0) {
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
