import { create } from 'zustand';
import type { DateRange } from '@/lib/types/api';
import type { TableFilter } from '@/types/filters';
import type { SessionReportRow } from '@/types/sessionReport';
import { handleStoreError } from '@/lib/api/errorHandler';
import { fetchSessionDataFlat } from '@/lib/api/sessionClient';
import { buildSessionTree, type SessionFlatRow } from '@/lib/utils/sessionTree';

const DEFAULT_DIMENSIONS = ['entryUrlPath', 'entryUtmSource', 'entryPageType', 'entryCountryCode', 'entryDeviceType', 'date'];
const DEFAULT_SORT_COLUMN = 'pageViews';
const DEFAULT_SORT_DIR: 'ascend' | 'descend' = 'descend';

function defaultDateRange(): DateRange {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Collect keys for all rows that have children (auto-expand level 0) */
function collectExpandKeys(rows: SessionReportRow[]): string[] {
  return rows.filter(r => r.hasChildren).map(r => r.key);
}

/** Serialize active filters to API format */
function toApiFilters(
  filters: TableFilter[],
): Array<{ field: string; operator: string; value: string }> | undefined {
  const valid = filters
    .filter(f => f.value)
    .map(({ field, operator, value }) => ({ field, operator, value }));
  return valid.length > 0 ? valid : undefined;
}

interface SessionAnalyticsState {
  // Active state (toolbar controls)
  dateRange: DateRange;
  dimensions: string[];
  filters: TableFilter[];

  // Loaded state (dual-state pattern)
  loadedDimensions: string[];
  loadedDateRange: DateRange;
  loadedFilters: TableFilter[];

  // Data
  flatData: SessionFlatRow[];
  reportData: SessionReportRow[];

  // UI
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
  loadChildData: (key: string, value: string, depth: number) => Promise<void>;
}

export const useSessionStore = create<SessionAnalyticsState>((set, get) => ({
  dateRange: defaultDateRange(),
  dimensions: DEFAULT_DIMENSIONS,
  filters: [],
  loadedDimensions: DEFAULT_DIMENSIONS,
  loadedDateRange: defaultDateRange(),
  loadedFilters: [],
  flatData: [],
  reportData: [],
  expandedRowKeys: [],
  sortColumn: DEFAULT_SORT_COLUMN,
  sortDirection: DEFAULT_SORT_DIR,
  isLoading: false,
  isLoadingSubLevels: false,
  hasUnsavedChanges: false,
  hasLoadedOnce: false,

  setDateRange: (range) => set({ dateRange: range, hasUnsavedChanges: true }),

  setFilters: (filters) => set({ filters, hasUnsavedChanges: true }),

  addDimension: (id) => {
    const { dimensions } = get();
    if (!dimensions.includes(id)) {
      set({ dimensions: [...dimensions, id], hasUnsavedChanges: true });
    }
  },

  removeDimension: (id) => {
    const { dimensions } = get();
    if (dimensions.length > 1) {
      set({ dimensions: dimensions.filter(d => d !== id), hasUnsavedChanges: true });
    }
  },

  reorderDimensions: (newOrder) => set({ dimensions: newOrder, hasUnsavedChanges: true }),

  setExpandedRowKeys: (keys) => set({ expandedRowKeys: keys }),

  setSort: async (column, direction) => {
    const { flatData, dimensions, hasLoadedOnce } = get();
    set({ sortColumn: column, sortDirection: direction });

    if (hasLoadedOnce && flatData.length > 0) {
      const tree = buildSessionTree(flatData, dimensions, column, direction);
      set({ reportData: tree, expandedRowKeys: collectExpandKeys(tree) });
    }
  },

  setLoadedDimensions: (dimensions) =>
    set({ dimensions, loadedDimensions: dimensions, hasUnsavedChanges: false }),

  resetFilters: () => {
    const { loadedDateRange, loadedDimensions, loadedFilters } = get();
    set({
      dateRange: loadedDateRange,
      dimensions: loadedDimensions,
      filters: loadedFilters,
      hasUnsavedChanges: false,
    });
  },

  loadData: async () => {
    const { dateRange, dimensions, filters, sortColumn, sortDirection } = get();
    set({ isLoading: true, reportData: [] });

    try {
      const flatData = await fetchSessionDataFlat({
        dateRange,
        dimensions,
        filters: toApiFilters(filters),
      });

      const tree = buildSessionTree(flatData, dimensions, sortColumn, sortDirection);

      set({
        isLoading: false,
        hasUnsavedChanges: false,
        hasLoadedOnce: true,
        loadedDimensions: dimensions,
        loadedDateRange: dateRange,
        loadedFilters: filters,
        flatData,
        reportData: tree,
        expandedRowKeys: collectExpandKeys(tree),
      });
    } catch (error: unknown) {
      handleStoreError('load data', error);
      set({ isLoading: false });
    }
  },

  // No-op — children are pre-populated in the tree
  loadChildData: async () => {},
}));
