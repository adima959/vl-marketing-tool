import { create, type StoreApi } from 'zustand';
import type { DateRange, QueryParams } from '@/lib/types/api';
import type { TableFilter } from '@/types/filters';
import { normalizeError } from '@/lib/types/errors';
import { handleStoreError } from '@/lib/api/errorHandler';
import {
  updateHasChildren,
  updateTreeChildren,
  updateTreeWithResults,
  parseKeyToParentFilters,
  restoreExpandedRows,
} from '@/lib/utils/treeUtils';

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

/** Serialize active filters to API format (reused across loadData, setSort, loadChildData) */
function buildApiFilters(filters: TableFilter[], hasFilters: boolean): QueryParams['filters'] {
  if (!hasFilters) return undefined;
  const valid = filters.filter(f => f.value).map(({ field, operator, value }) => ({ field, operator, value }));
  return valid.length > 0 ? valid : undefined;
}

/** Build sort params for fetch calls */
function buildSortParams(
  sortColumn: string | null,
  sortDirection: 'ascend' | 'descend' | null,
  defaultSortColumn: string
): { sortBy: string; sortDirection: 'ASC' | 'DESC' } {
  return {
    sortBy: sortColumn || defaultSortColumn,
    sortDirection: sortDirection === 'ascend' ? 'ASC' : 'DESC',
  };
}

/**
 * Auto-expand all top-level rows by loading depth-1 children in batches of 10.
 * Returns updated data with children attached.
 */
async function autoExpandFirstLevel<TRow extends BaseTableRow>(
  data: TRow[],
  opts: {
    fetchData: (params: QueryParams) => Promise<TRow[]>;
    dateRange: DateRange;
    dimensions: string[];
    filters: QueryParams['filters'];
    sort: { sortBy: string; sortDirection: 'ASC' | 'DESC' };
  }
): Promise<{ updatedData: TRow[]; expandedKeys: string[] }> {
  const expandableRows = data.filter(row => row.hasChildren);
  if (expandableRows.length === 0) return { updatedData: data, expandedKeys: [] };

  const expandedKeys = expandableRows.map(row => row.key);
  const BATCH_SIZE = 10;
  const allResults: PromiseSettledResult<{ success: boolean; key: string; children: TRow[] }>[] = [];

  for (let i = 0; i < expandableRows.length; i += BATCH_SIZE) {
    const batch = expandableRows.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map((parentRow) => {
      const parentFilters: Record<string, string> = {
        [opts.dimensions[0]]: parentRow.attribute,
      };

      return opts.fetchData({
        dateRange: opts.dateRange,
        dimensions: opts.dimensions,
        depth: 1,
        parentFilters,
        filters: opts.filters,
        ...opts.sort,
      })
        .then((children) => ({ success: true, key: parentRow.key, children }))
        .catch((error) => {
          console.warn(`Failed to load children for ${parentRow.key}:`, error);
          return { success: false, key: parentRow.key, children: [] as TRow[] };
        });
    });

    const batchResults = await Promise.allSettled(batchPromises);
    allResults.push(...batchResults);
  }

  return { updatedData: updateTreeWithResults(data, allResults), expandedKeys };
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
            reportData: updateHasChildren(reportData, newDimensions.length)
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
            reportData: updateHasChildren(reportData, newDimensions.length)
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
        set({ isLoading: true });
        const sort = buildSortParams(column, direction, defaultSortColumn);

        try {
          const data = await fetchData({
            dateRange: state.dateRange,
            dimensions: state.dimensions,
            depth: 0,
            filters: buildApiFilters(state.filters, hasFilters),
            ...sort,
          });

          set({
            isLoading: false,
            hasUnsavedChanges: false,
            hasLoadedOnce: true,
            loadedDimensions: state.dimensions,
            loadedDateRange: state.dateRange,
            loadedFilters: state.filters,
            reportData: data,
            expandedRowKeys: [],
          });
        } catch (error: unknown) {
          handleStoreError('sort data', error);
          set({ isLoading: false });
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
      const savedExpandedKeys = [...state.expandedRowKeys];
      const filters = buildApiFilters(state.filters, hasFilters);
      const sort = buildSortParams(state.sortColumn, state.sortDirection, defaultSortColumn);

      const dimensionsChanged =
        state.dimensions.length !== state.loadedDimensions.length ||
        state.dimensions.some((dim, i) => dim !== state.loadedDimensions[i]);

      set({ isLoading: true, reportData: [] });

      try {
        const data = await fetchData({
          dateRange: state.dateRange,
          dimensions: state.dimensions,
          depth: 0,
          filters,
          ...sort,
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
          const expandedKeys = data.filter(r => r.hasChildren).map(r => r.key);
          set({ isLoadingSubLevels: true, expandedRowKeys: [...expandedKeys] });

          const result = await autoExpandFirstLevel(data, {
            fetchData, dateRange: state.dateRange, dimensions: state.dimensions, filters, sort,
          });

          set({
            reportData: result.updatedData,
            expandedRowKeys: result.expandedKeys,
            isLoadingSubLevels: false,
          });
        }
        // Restore saved expanded keys on manual reload
        else if (savedExpandedKeys.length > 0 && state.hasLoadedOnce) {
          set({ isLoadingSubLevels: true });

          const { updatedData, validKeys } = await restoreExpandedRows<TRow>({
            savedExpandedKeys,
            reportData: data,
            dimensions: state.dimensions,
            fetchChildren: (parentFilters, depth) =>
              fetchData({
                dateRange: state.dateRange,
                dimensions: state.dimensions,
                depth,
                parentFilters,
                filters,
                ...sort,
              }),
          });

          set({
            reportData: updatedData,
            expandedRowKeys: validKeys,
            isLoadingSubLevels: false,
          });
        }
      } catch (error: unknown) {
        handleStoreError('load data', error);
        set({ isLoading: false, isLoadingSubLevels: false });
      }
    },

    loadChildData: async (parentKey: string, _parentValue: string, parentDepth: number) => {
      const state = get();
      set({ isLoadingSubLevels: true });

      try {
        const parentFilters = parseKeyToParentFilters(parentKey, state.loadedDimensions);

        const children = await fetchData({
          dateRange: state.loadedDateRange,
          dimensions: state.loadedDimensions,
          depth: parentDepth + 1,
          parentFilters,
          filters: buildApiFilters(state.loadedFilters, hasFilters),
          ...buildSortParams(state.sortColumn, state.sortDirection, defaultSortColumn),
        });

        set({
          reportData: updateTreeChildren(state.reportData, parentKey, children),
          isLoadingSubLevels: false,
        });
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
