import { create } from 'zustand';
import type { SaleRow, SalesDimension, DashboardRow, DailyAggregate } from '@/types/sales';
import { aggregateSales, aggregateByDate } from '@/lib/utils/salesAggregation';
import { fetchCRMSales, fetchCRMTimeseries } from '@/lib/api/crmClient';
import { formatLocalDate } from '@/lib/types/api';
import { handleStoreError } from '@/lib/api/errorHandler';

interface DateRange {
  start: Date;
  end: Date;
}

function getDefaultDateRange(): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return { start: today, end: today };
}

function getTimeseriesRange(): DateRange {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  return { start, end };
}

const DEFAULT_DIMENSIONS: string[] = ['source', 'productGroup', 'country', 'product'];

export interface DashboardState {
  // Raw flat data
  salesData: SaleRow[];
  timeSeriesRaw: SaleRow[];

  // Aggregated data (derived from salesData)
  reportData: DashboardRow[];
  timeSeriesData: DailyAggregate[];

  // Active state (user is editing)
  dateRange: DateRange;
  dimensions: string[];

  // Loaded state (dual-state pattern)
  loadedDateRange: DateRange;
  loadedDimensions: string[];

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

export const useDashboardStore = create<DashboardState>((set, get) => ({
  // Initial state
  salesData: [],
  timeSeriesRaw: [],
  reportData: [],
  timeSeriesData: [],

  dateRange: getDefaultDateRange(),
  dimensions: DEFAULT_DIMENSIONS,

  loadedDateRange: getDefaultDateRange(),
  loadedDimensions: DEFAULT_DIMENSIONS,

  expandedRowKeys: [],
  sortColumn: 'subscriptions',
  sortDirection: 'descend',
  isLoading: false,
  isLoadingSubLevels: false,
  hasUnsavedChanges: false,
  hasLoadedOnce: false,

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

  reorderDimensions: (newOrder) => set({
    dimensions: newOrder,
    hasUnsavedChanges: true,
  }),

  setExpandedRowKeys: (keys) => set({ expandedRowKeys: keys }),

  setSort: async (column, direction) => {
    const { salesData, dimensions } = get();
    set({ sortColumn: column, sortDirection: direction });

    if (salesData.length > 0) {
      const reportData = aggregateSales(salesData, dimensions as SalesDimension[], column, direction);
      set({ reportData });
    }
  },

  setLoadedDimensions: (dimensions) => set({
    dimensions,
    loadedDimensions: dimensions,
    hasUnsavedChanges: false,
  }),

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
    set({ isLoading: true, reportData: [] });

    try {
      const dateBody = {
        dateRange: {
          start: formatLocalDate(state.dateRange.start),
          end: formatLocalDate(state.dateRange.end),
        },
        includeCancelInfo: true,
      };

      const tsRange = getTimeseriesRange();
      const tsBody = {
        dateRange: {
          start: formatLocalDate(tsRange.start),
          end: formatLocalDate(tsRange.end),
        },
      };

      const [salesData, timeSeriesRaw] = await Promise.all([
        fetchCRMSales(dateBody),
        fetchCRMTimeseries(tsBody),
      ]);

      const reportData = aggregateSales(
        salesData,
        state.dimensions as SalesDimension[],
        state.sortColumn,
        state.sortDirection,
      );
      const timeSeriesData = aggregateByDate(timeSeriesRaw);

      set({
        salesData,
        timeSeriesRaw,
        reportData,
        timeSeriesData,
        isLoading: false,
        hasUnsavedChanges: false,
        hasLoadedOnce: true,
        loadedDimensions: state.dimensions,
        loadedDateRange: state.dateRange,
        expandedRowKeys: reportData.filter(r => r.hasChildren).map(r => r.key),
      });
    } catch (error: unknown) {
      handleStoreError('load dashboard data', error);
      set({ isLoading: false });
    }
  },

  // No-op: children are pre-computed in aggregateSales()
  loadChildData: async () => {},
}));
