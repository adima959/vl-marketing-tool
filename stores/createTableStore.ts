import { create, type StoreApi } from 'zustand';
import type { DateRange, QueryParams } from '@/lib/types/api';
import type { TableFilter } from '@/types/filters';
import { normalizeError } from '@/lib/types/errors';
import { findRowByKey } from '@/lib/treeUtils';

/**
 * Base row interface that all table row types must extend
 */
export interface BaseTableRow {
  key: string;
  attribute: string;
  depth: number;
  hasChildren?: boolean;
  children?: BaseTableRow[];
  metrics: Record<string, number | null>;
}

/**
 * Configuration for creating a table store
 */
export interface TableStoreConfig<TRow extends BaseTableRow> {
  /** Function to fetch data from API */
  fetchData: (params: QueryParams) => Promise<TRow[]>;
  /** Function to get default date range */
  defaultDateRange: () => DateRange;
  /** Default dimensions for the table */
  defaultDimensions: string[];
  /** Default sort column */
  defaultSortColumn: string;
  /** Default sort direction */
  defaultSortDirection: 'ascend' | 'descend';
  /** Whether this table supports user-defined filters */
  hasFilters?: boolean;
}

/**
 * State interface for table stores
 */
export interface TableStore<TRow extends BaseTableRow> {
  // Filters
  dateRange: DateRange;
  dimensions: string[];
  filters: TableFilter[];

  // Loaded state (dual-state pattern)
  loadedDimensions: string[];
  loadedDateRange: DateRange;
  loadedFilters: TableFilter[];
  reportData: TRow[];

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

/**
 * Helper: Update hasChildren property for all rows based on dimension count
 * This is called when dimensions are added or removed
 */
function updateHasChildren<TRow extends BaseTableRow>(
  rows: TRow[],
  currentDimensions: string[]
): TRow[] {
  return rows.map(row => {
    const newHasChildren = row.depth < currentDimensions.length - 1;
    const updatedRow = { ...row, hasChildren: newHasChildren };

    if (row.children && row.children.length > 0) {
      updatedRow.children = updateHasChildren(row.children as TRow[], currentDimensions);
    }

    return updatedRow as TRow;
  });
}

/**
 * Creates a Zustand store for hierarchical table data with common patterns:
 * - Dual-state management (active vs loaded)
 * - Dimension management with hasChildren updates
 * - Hierarchical data loading with auto-expansion
 * - Sort handling and expanded row restoration
 *
 * @param config Configuration object with fetch function and defaults
 * @returns Zustand store with TableStore interface
 */
export function createTableStore<TRow extends BaseTableRow>(
  config: TableStoreConfig<TRow>
): StoreApi<TableStore<TRow>> & { (): TableStore<TRow> } {
  const {
    fetchData,
    defaultDateRange,
    defaultDimensions,
    defaultSortColumn,
    defaultSortDirection,
    hasFilters = false,
  } = config;

  const getDefaultFilters = (): TableFilter[] => (hasFilters ? [] : []);

  return create<TableStore<TRow>>((set, get) => ({
    // Initial state
    dateRange: defaultDateRange(),
    dimensions: defaultDimensions,
    filters: getDefaultFilters(),
    loadedDimensions: defaultDimensions,
    loadedDateRange: defaultDateRange(),
    loadedFilters: getDefaultFilters(),
    reportData: [],
    expandedRowKeys: [],
    sortColumn: defaultSortColumn,
    sortDirection: defaultSortDirection,
    isLoading: false,
    isLoadingSubLevels: false,
    hasUnsavedChanges: false,
    hasLoadedOnce: false,
    error: null,

    // Actions
    setDateRange: (range) => set({ dateRange: range, hasUnsavedChanges: true }),

    setFilters: (filters) => {
      if (hasFilters) {
        set({ filters, hasUnsavedChanges: true });
      }
    },

    addDimension: (id) => {
      const { dimensions, reportData, loadedDimensions } = get();
      if (!dimensions.includes(id)) {
        const newDimensions = [...dimensions, id];

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
        const apiFilters = hasFilters
          ? state.filters.filter(f => f.value).map(({ field, operator, value }) => ({ field, operator, value }))
          : [];

        try {
          const data = await fetchData({
            dateRange: state.dateRange,
            dimensions: state.dimensions,
            depth: 0,
            ...(apiFilters.length > 0 && { filters: apiFilters }),
            sortBy: column || defaultSortColumn,
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
      const apiFilters = hasFilters
        ? state.filters.filter(f => f.value).map(({ field, operator, value }) => ({ field, operator, value }))
        : [];

      // Check if dimensions have changed
      const dimensionsChanged =
        state.dimensions.length !== state.loadedDimensions.length ||
        state.dimensions.some((dim, i) => dim !== state.loadedDimensions[i]);

      // Clear old data to prevent stale children from blocking fresh loads
      set({ isLoading: true, error: null, reportData: [] });

      try {
        const data = await fetchData({
          dateRange: state.dateRange,
          dimensions: state.dimensions,
          depth: 0,
          ...(apiFilters.length > 0 && { filters: apiFilters }),
          sortBy: state.sortColumn || defaultSortColumn,
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

          // Load depth 1 for all top-level rows in batches of 10 to avoid overwhelming the server
          const expandableRows = data.filter(row => row.hasChildren);
          const BATCH_SIZE = 10;
          const allDepth1Results: Array<{ status: string; value: { success: boolean; key: string; children: TRow[] } }> = [];

          for (let i = 0; i < expandableRows.length; i += BATCH_SIZE) {
            const batch = expandableRows.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map((parentRow) => {
              const parentFilters: Record<string, string> = {
                [state.dimensions[0]]: parentRow.attribute,
              };

              return fetchData({
                dateRange: state.dateRange,
                dimensions: state.dimensions,
                depth: 1,
                parentFilters,
                ...(apiFilters.length > 0 && { filters: apiFilters }),
                sortBy: state.sortColumn || defaultSortColumn,
                sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
              })
                .then((children) => ({ success: true, key: parentRow.key, children }))
                .catch((error) => {
                  console.warn(`Failed to load children for ${parentRow.key}:`, error);
                  return { success: false, key: parentRow.key, children: [] as TRow[] };
                });
            });

            const batchResults = await Promise.allSettled(batchPromises);
            for (const result of batchResults) {
              allDepth1Results.push(result as typeof allDepth1Results[number]);
            }
          }

          // Update tree with depth 1 data
          const updateTreeDepth1 = (rows: TRow[]): TRow[] => {
            return rows.map((row) => {
              for (const result of allDepth1Results) {
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
            const rowsToLoad: Array<{ key: string; row: TRow }> = [];

            for (const key of keysAtDepth) {
              const currentData = get().reportData;
              const row = findRowByKey(currentData, key) as TRow | null;
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

                return fetchData({
                  dateRange: state.dateRange,
                  dimensions: state.dimensions,
                  depth: row.depth + 1,
                  parentFilters,
                  ...(apiFilters.length > 0 && { filters: apiFilters }),
                  sortBy: state.sortColumn || defaultSortColumn,
                  sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
                })
                  .then((children) => ({ success: true, key, children }))
                  .catch((error) => {
                    console.warn(`Failed to reload expanded row ${key}:`, error);
                    return { success: false, key, children: [] as TRow[] };
                  });
              });

              const results = await Promise.allSettled(childDataPromises);

              // Update tree once with all children for this depth level
              const updateTree = (rows: TRow[]): TRow[] => {
                return rows.map((row) => {
                  for (const result of results) {
                    if (result.status === 'fulfilled' && result.value.success && result.value.key === row.key) {
                      return { ...row, children: result.value.children };
                    }
                  }
                  if (row.children && row.children.length > 0) {
                    return { ...row, children: updateTree(row.children as TRow[]) };
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

    loadChildData: async (parentKey: string, _parentValue: string, parentDepth: number) => {
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

        const loadedApiFilters = hasFilters
          ? state.loadedFilters.filter(f => f.value).map(({ field, operator, value }) => ({ field, operator, value }))
          : [];

        const children = await fetchData({
          dateRange: state.loadedDateRange,
          dimensions: state.loadedDimensions,
          depth: parentDepth + 1,
          parentFilters,
          ...(loadedApiFilters.length > 0 && { filters: loadedApiFilters }),
          sortBy: state.sortColumn || defaultSortColumn,
          sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
        });

        // Update reportData tree with children
        const updateTree = (rows: TRow[]): TRow[] => {
          return rows.map((row) => {
            if (row.key === parentKey) {
              return { ...row, children };
            }
            if (row.children && row.children.length > 0) {
              return { ...row, children: updateTree(row.children as TRow[]) };
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
}
