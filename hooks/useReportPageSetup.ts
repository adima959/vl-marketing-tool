import { useMemo, useCallback } from 'react';
import type { DateRange } from '@/lib/types/api';
import type { TableFilter } from '@/types/filters';
import type { ResolvedViewParams } from '@/types/savedViews';

interface StoreState {
  dateRange: DateRange;
  dimensions: string[];
  filters: TableFilter[];
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;
  setSort: (column: string, direction: 'ascend' | 'descend') => void;
  loadData: () => void;
}

interface ReportPageSetupConfig {
  /** Reactive dateRange from the store hook (triggers re-render) */
  dateRange: DateRange;
  /** Get full store state (Zustand .getState()) */
  getStoreState: () => StoreState;
  /** Bulk-update store state (Zustand .setState()) */
  setStoreState: (partial: {
    dateRange?: DateRange;
    dimensions?: string[];
    filters?: TableFilter[];
    hasUnsavedChanges?: boolean;
  }) => void;
  /** Extra logic to run during applyView (e.g. set visible columns) */
  onApplyView?: (params: ResolvedViewParams) => void;
  /** Extra fields to include in getCurrentState (e.g. visibleColumns) */
  getExtraState?: () => Record<string, unknown>;
}

interface SavedViewState {
  dateRange: DateRange;
  dimensions: string[];
  sortBy: string | null;
  sortDir: 'ascend' | 'descend' | null;
  filters?: { field: string; operator: string; value: string }[];
  [key: string]: unknown;
}

interface ReportPageSetupReturn {
  includesToday: boolean;
  handleApplyView: (params: ResolvedViewParams) => void;
  getCurrentState: () => SavedViewState;
}

export function useReportPageSetup(config: ReportPageSetupConfig): ReportPageSetupReturn {
  const { dateRange, getStoreState, setStoreState, onApplyView, getExtraState } = config;

  const includesToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);
    return today >= start && today <= end;
  }, [dateRange]);

  const handleApplyView = useCallback((params: ResolvedViewParams) => {
    const store = getStoreState();
    const viewFilters: TableFilter[] = params.filters
      ? params.filters.map((f, i) => ({
          id: `view-${i}-${Date.now()}`,
          field: f.field,
          operator: f.operator as TableFilter['operator'],
          value: f.value,
        }))
      : [];
    setStoreState({
      dateRange: { start: params.start, end: params.end },
      ...(params.dimensions && { dimensions: params.dimensions }),
      filters: viewFilters,
      hasUnsavedChanges: false,
    });
    onApplyView?.(params);
    if (params.sortBy) {
      store.setSort(params.sortBy, params.sortDir ?? 'descend');
    } else {
      store.loadData();
    }
  }, [getStoreState, setStoreState, onApplyView]);

  const getCurrentState = useCallback((): SavedViewState => {
    const { dateRange: dr, dimensions, filters: storeFilters, sortColumn, sortDirection } = getStoreState();
    const activeFilters = storeFilters
      .filter((f) => f.field && f.value)
      .map(({ field, operator, value }) => ({ field, operator, value }));
    return {
      dateRange: dr,
      dimensions,
      sortBy: sortColumn,
      sortDir: sortDirection,
      ...(activeFilters.length > 0 && { filters: activeFilters }),
      ...getExtraState?.(),
    };
  }, [getStoreState, getExtraState]);

  return { includesToday, handleApplyView, getCurrentState };
}
