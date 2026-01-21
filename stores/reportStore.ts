import { create } from 'zustand';
import { fetchReportData } from '@/lib/api/client';
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
  hasUnsavedChanges: false,
  hasLoadedOnce: false,
  error: null,

  // Actions
  setDateRange: (range) => set({ dateRange: range, hasUnsavedChanges: true }),

  addDimension: (id) => {
    const { dimensions } = get();
    if (!dimensions.includes(id)) {
      set({ dimensions: [...dimensions, id], hasUnsavedChanges: true });
    }
  },

  removeDimension: (id) => {
    const { dimensions } = get();
    if (dimensions.length > 1) {
      set({ dimensions: dimensions.filter((d) => d !== id), hasUnsavedChanges: true });
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
      // Save expanded keys before reload
      const savedExpandedKeys = [...state.expandedRowKeys];

      // Load top-level data
      set({ isLoading: true, error: null });

      try {
        const data = await fetchReportData({
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
          expandedRowKeys: savedExpandedKeys, // Keep expanded keys
        });

        // Reload child data for all previously expanded rows
        if (savedExpandedKeys.length > 0) {
          const { sortKeysByDepth } = await import('@/lib/treeUtils');
          const sortedKeys = sortKeysByDepth(savedExpandedKeys);

          for (const key of sortedKeys) {
            const currentData = get().reportData;
            const { findRowByKey } = await import('@/lib/treeUtils');
            const row = findRowByKey(currentData, key);

            if (row && row.hasChildren) {
              try {
                await get().loadChildData(key, row.attribute, row.depth);
              } catch (error) {
                console.warn(`Failed to reload expanded row ${key}:`, error);
              }
            }
          }
        }
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
    set({ isLoading: true, error: null });

    try {
      const data = await fetchReportData({
        dateRange: state.dateRange,
        dimensions: state.dimensions,
        depth: 0,
        sortBy: state.sortColumn || 'clicks',
        sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
      });

      // Auto-expand first level rows if there are more dimensions
      const shouldAutoExpand = state.dimensions.length > 1 && data.length > 0;
      const firstLevelKeys = shouldAutoExpand ? data.map(row => row.key) : [];

      set({
        isLoading: false,
        hasUnsavedChanges: false,
        hasLoadedOnce: true,
        loadedDimensions: state.dimensions,
        loadedDateRange: state.dateRange,
        reportData: data,
        expandedRowKeys: firstLevelKeys,
      });

      // Load child data for all first-level rows
      if (shouldAutoExpand) {
        // Use setTimeout to ensure state has been updated
        setTimeout(async () => {
          const currentState = get();
          for (const row of data) {
            if (row.hasChildren) {
              try {
                const children = await fetchReportData({
                  dateRange: currentState.loadedDateRange,
                  dimensions: currentState.loadedDimensions,
                  depth: row.depth + 1,
                  parentFilters: { [currentState.loadedDimensions[0]]: row.attribute },
                  sortBy: currentState.sortColumn || 'clicks',
                  sortDirection: currentState.sortDirection === 'ascend' ? 'ASC' : 'DESC',
                });

                // Update tree with children
                const updateTree = (rows: ReportRow[]): ReportRow[] => {
                  return rows.map((r) => {
                    if (r.key === row.key) {
                      return { ...r, children };
                    }
                    if (r.children && r.children.length > 0) {
                      return { ...r, children: updateTree(r.children) };
                    }
                    return r;
                  });
                };

                set({ reportData: updateTree(get().reportData) });
              } catch (error) {
                console.warn(`Failed to auto-expand row ${row.key}:`, error);
              }
            }
          }
        }, 0);
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

      const children = await fetchReportData({
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

      set({ reportData: updateTree(state.reportData) });
    } catch (error: unknown) {
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
