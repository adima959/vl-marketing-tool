import { create } from 'zustand';
import { fetchMarketingData } from '@/lib/api/marketingClient';
import type { DateRange, ReportRow } from '@/types';
import { normalizeError } from '@/lib/types/errors';
import { findRowByKey } from '@/lib/treeUtils';

interface ReportState {
  // Filters
  dateRange: DateRange;
  dimensions: string[];

  // Loaded state
  loadedDimensions: string[];
  loadedDateRange: DateRange;
  reportData: ReportRow[];

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
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const end = new Date(yesterday);
  end.setHours(23, 59, 59, 999);
  return { start: yesterday, end };
};

export const useReportStore = create<ReportState>((set, get) => ({
  // Initial state
  dateRange: getDefaultDateRange(),
  dimensions: ['network', 'campaign', 'adset'],
  loadedDimensions: ['network', 'campaign', 'adset'],
  loadedDateRange: getDefaultDateRange(),
  reportData: [],
  expandedRowKeys: [],
  sortColumn: 'clicks',
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

      // Update hasChildren for all existing rows based on new dimension count
      const updateHasChildren = (rows: ReportRow[], currentDimensions: string[]): ReportRow[] => {
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
      const updateHasChildren = (rows: ReportRow[], currentDimensions: string[]): ReportRow[] => {
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
    // Update sort state
    set({ sortColumn: column, sortDirection: direction });

    // Only reload if data has been loaded at least once
    if (state.hasLoadedOnce) {
      // Load top-level data with new sort
      set({ isLoading: true, error: null });

      try {
        const data = await fetchMarketingData({
          dateRange: state.dateRange,
          dimensions: state.dimensions,
          depth: 0,
          sortBy: column || 'clicks',
          sortDirection: direction === 'ascend' ? 'ASC' : 'DESC',
        });

        set({
          isLoading: false,
          hasUnsavedChanges: false,
          hasLoadedOnce: true,
          loadedDimensions: state.dimensions,
          loadedDateRange: state.dateRange,
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
    const defaultDateRange = getDefaultDateRange();
    const state = get();
    set({
      dateRange: state.loadedDateRange,
      dimensions: state.loadedDimensions,
      hasUnsavedChanges: false,
    });
  },

  loadData: async () => {
    const state = get();
    // Save expanded keys to restore after reload
    const savedExpandedKeys = [...state.expandedRowKeys];

    // Check if dimensions have changed
    const dimensionsChanged =
      state.dimensions.length !== state.loadedDimensions.length ||
      state.dimensions.some((dim, i) => dim !== state.loadedDimensions[i]);

    // Clear old data to prevent stale children from blocking fresh loads
    set({ isLoading: true, error: null, reportData: [] });

    try {
      const data = await fetchMarketingData({
        dateRange: state.dateRange,
        dimensions: state.dimensions,
        depth: 0,
        sortBy: state.sortColumn || 'clicks',
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

      // Auto-expand level one if this is a fresh load or dimensions changed
      if ((savedExpandedKeys.length === 0 || dimensionsChanged) && data.length > 0) {
        const allExpandedKeys: string[] = [];

        // Collect depth 0 keys that will be expanded
        for (const row of data) {
          if (row.hasChildren) {
            allExpandedKeys.push(row.key);
          }
        }

        // Set loading state and expanded keys early so skeleton rows can show
        set({ isLoadingSubLevels: true, expandedRowKeys: [...allExpandedKeys] });

        // Load depth 1 for all top-level rows in parallel
        const depth1Promises = data.map((parentRow) => {
          if (parentRow.hasChildren) {
            const parentFilters: Record<string, string> = {
              [state.dimensions[0]]: parentRow.attribute,
            };

            return fetchMarketingData({
              dateRange: state.dateRange,
              dimensions: state.dimensions,
              depth: 1,
              parentFilters,
              sortBy: state.sortColumn || 'clicks',
              sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
            })
              .then((children) => ({ success: true, key: parentRow.key, children }))
              .catch((error) => {
                console.warn(`Failed to load children for ${parentRow.key}:`, error);
                return { success: false, key: parentRow.key, children: [] };
              });
          }
          return Promise.resolve({ success: false, key: parentRow.key, children: [] });
        });

        const depth1Results = await Promise.allSettled(depth1Promises);

        // Update tree with depth 1 data
        const updateTreeDepth1 = (rows: ReportRow[]): ReportRow[] => {
          return rows.map((row) => {
            for (const result of depth1Results) {
              if (result.status === 'fulfilled' && result.value.success && result.value.key === row.key) {
                return { ...row, children: result.value.children };
              }
            }
            return row;
          });
        };

        set({ reportData: updateTreeDepth1(data), expandedRowKeys: allExpandedKeys, isLoadingSubLevels: false });
      }
      // If there are saved expanded keys, restore them (manual reload)
      else if (savedExpandedKeys.length > 0 && state.hasLoadedOnce) {
        set({ isLoadingSubLevels: true });
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
          const rowsToLoad: Array<{ key: string; row: ReportRow }> = [];

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
            const childDataPromises = rowsToLoad.map(({ key, row }) => {
              const keyParts = key.split('::');
              const parentFilters: Record<string, string> = {};
              keyParts.forEach((value, index) => {
                const dimension = state.dimensions[index];
                if (dimension) {
                  parentFilters[dimension] = value;
                }
              });

              return fetchMarketingData({
                dateRange: state.dateRange,
                dimensions: state.dimensions,
                depth: row.depth + 1,
                parentFilters,
                sortBy: state.sortColumn || 'clicks',
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
            const updateTree = (rows: ReportRow[]): ReportRow[] => {
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

            // Small delay for state propagation
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }

        // Update to only valid keys (some may not exist after filter change)
        if (allValidKeys.length !== savedExpandedKeys.length) {
          set({ expandedRowKeys: allValidKeys });
        }
        set({ isLoadingSubLevels: false });
      }
    } catch (error: unknown) {
      const appError = normalizeError(error);
      console.error('Failed to load data:', {
        code: appError.code,
        message: appError.message,
      });
      set({
        isLoading: false,
        isLoadingSubLevels: false,
        error: appError.message,
      });
    }
  },

  loadChildData: async (parentKey: string, parentValue: string, parentDepth: number) => {
    const state = get();
    set({ isLoadingSubLevels: true });

    try {
      // Build complete parent filter chain by parsing the key hierarchy
      // Key format: "value1::value2::value3" corresponds to dimensions in order
      const keyParts = parentKey.split('::');
      const parentFilters: Record<string, string> = {};

      keyParts.forEach((value, index) => {
        const dimension = state.loadedDimensions[index];
        if (dimension) {
          parentFilters[dimension] = value;
        }
      });

      const children = await fetchMarketingData({
        dateRange: state.loadedDateRange,
        dimensions: state.loadedDimensions,
        depth: parentDepth + 1,
        parentFilters,
        sortBy: state.sortColumn || 'clicks',
        sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
      });

      // Update reportData tree with children
      const updateTree = (rows: ReportRow[]): ReportRow[] => {
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
      // Re-throw error so UI can handle it with toast
      throw appError;
    }
  },
}));
