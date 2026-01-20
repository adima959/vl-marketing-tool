import { create } from 'zustand';
import { fetchReportData } from '@/lib/api/client';
import type { DateRange, ReportRow } from '@/types';
import { normalizeError } from '@/lib/types/errors';

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
  error: string | null;

  // Actions
  setDateRange: (range: DateRange) => void;
  addDimension: (id: string) => void;
  removeDimension: (id: string) => void;
  reorderDimensions: (newOrder: string[]) => void;
  setExpandedRowKeys: (keys: string[]) => void;
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => void;
  loadData: () => Promise<void>;
  loadChildData: (parentKey: string, parentValue: string, parentDepth: number) => Promise<void>;
}

const getDefaultDateRange = (): DateRange => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 30); // Last 30 days
  start.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const useReportStore = create<ReportState>((set, get) => ({
  // Initial state
  dateRange: getDefaultDateRange(),
  dimensions: ['network', 'campaign'],
  loadedDimensions: ['network', 'campaign'],
  loadedDateRange: getDefaultDateRange(),
  reportData: [],
  expandedRowKeys: [],
  sortColumn: 'cost',
  sortDirection: 'descend',
  isLoading: false,
  hasUnsavedChanges: false,
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

  setSort: (column, direction) => set({ sortColumn: column, sortDirection: direction }),

  loadData: async () => {
    const state = get();
    set({ isLoading: true, error: null });

    try {
      const data = await fetchReportData({
        dateRange: state.dateRange,
        dimensions: state.dimensions,
        depth: 0,
        sortBy: state.sortColumn || 'cost',
        sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
      });

      set({
        isLoading: false,
        hasUnsavedChanges: false,
        loadedDimensions: state.dimensions,
        loadedDateRange: state.dateRange,
        reportData: data,
        expandedRowKeys: [],
      });
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
      // Build complete parent filter chain by traversing up the tree
      const buildParentFilters = (
        rows: ReportRow[],
        targetKey: string,
        filters: Record<string, string> = {}
      ): Record<string, string> | null => {
        for (const row of rows) {
          if (row.key === targetKey) {
            // Found the target row, add its filter
            filters[state.loadedDimensions[row.depth]] = row.attribute;
            return filters;
          }
          if (row.children && row.children.length > 0) {
            // Recursively search in children
            const childFilters = buildParentFilters(row.children, targetKey, {
              ...filters,
              [state.loadedDimensions[row.depth]]: row.attribute,
            });
            if (childFilters) {
              return childFilters;
            }
          }
        }
        return null;
      };

      const parentFilters = buildParentFilters(state.reportData, parentKey) || {};

      const children = await fetchReportData({
        dateRange: state.loadedDateRange,
        dimensions: state.loadedDimensions,
        depth: parentDepth + 1,
        parentFilters,
        sortBy: state.sortColumn || 'cost',
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
      set({ error: appError.message });
    }
  },
}));
