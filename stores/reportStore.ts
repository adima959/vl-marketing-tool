import { create } from 'zustand';
import type { DateRange } from '@/lib/types/api';
import { formatLocalDate } from '@/lib/types/api';
import type { TableFilter } from '@/types/filters';
import type { ReportRow } from '@/types/report';
import type { SaleRow } from '@/types/sales';
import { handleStoreError } from '@/lib/api/errorHandler';
import { fetchMarketingDataFlat } from '@/lib/api/marketingClient';
import { fetchCRMSales } from '@/lib/api/crmClient';
import { buildMarketingTree, attachCrmMetrics, type MarketingFlatRow } from '@/lib/utils/marketingTree';

const DEFAULT_DIMENSIONS = ['network', 'campaign', 'adset'];
const DEFAULT_SORT_COLUMN = 'clicks';
const DEFAULT_SORT_DIR: 'ascend' | 'descend' = 'descend';

function defaultDateRange(): DateRange {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const end = new Date(yesterday);
  end.setHours(23, 59, 59, 999);
  return { start: yesterday, end };
}

/** Collect keys for all rows that have children (auto-expand level 0) */
function collectExpandKeys(rows: ReportRow[]): string[] {
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

/** Build enriched flat data with CRM metrics attached */
function buildEnrichedTree(
  flatData: MarketingFlatRow[],
  crmSales: SaleRow[],
  dimensions: string[],
  sortColumn: string | null,
  sortDirection: 'ascend' | 'descend' | null,
): ReportRow[] {
  const enriched = attachCrmMetrics(flatData, crmSales, dimensions);
  return buildMarketingTree(enriched, dimensions, sortColumn, sortDirection);
}

interface MarketingReportState {
  // Active state (toolbar controls)
  dateRange: DateRange;
  dimensions: string[];
  filters: TableFilter[];

  // Loaded state (dual-state pattern)
  loadedDimensions: string[];
  loadedDateRange: DateRange;
  loadedFilters: TableFilter[];

  // Data
  flatData: MarketingFlatRow[];
  crmSales: SaleRow[];
  reportData: ReportRow[];

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

export const useReportStore = create<MarketingReportState>((set, get) => ({
  dateRange: defaultDateRange(),
  dimensions: DEFAULT_DIMENSIONS,
  filters: [],
  loadedDimensions: DEFAULT_DIMENSIONS,
  loadedDateRange: defaultDateRange(),
  loadedFilters: [],
  flatData: [],
  crmSales: [],
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
    const { flatData, crmSales, dimensions, hasLoadedOnce } = get();
    set({ sortColumn: column, sortDirection: direction });

    if (hasLoadedOnce && flatData.length > 0) {
      const tree = buildEnrichedTree(flatData, crmSales, dimensions, column, direction);
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
      const [flatData, crmSales] = await Promise.all([
        fetchMarketingDataFlat({
          dateRange,
          dimensions,
          filters: toApiFilters(filters),
        }),
        fetchCRMSales({
          dateRange: {
            start: formatLocalDate(dateRange.start),
            end: formatLocalDate(dateRange.end),
          },
          includeCancelInfo: true,
        }),
      ]);

      const tree = buildEnrichedTree(flatData, crmSales, dimensions, sortColumn, sortDirection);

      set({
        isLoading: false,
        hasUnsavedChanges: false,
        hasLoadedOnce: true,
        loadedDimensions: dimensions,
        loadedDateRange: dateRange,
        loadedFilters: filters,
        flatData,
        crmSales,
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
