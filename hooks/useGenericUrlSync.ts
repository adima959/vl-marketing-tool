import { useEffect, useRef, useState } from 'react';
import {
  useQueryStates,
  parseAsIsoDate,
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import type { TableFilter } from '@/types/filters';
import { restoreExpandedRows } from '@/lib/utils/treeUtils';

interface BaseReportRow {
  key: string;
  depth: number;
  hasChildren?: boolean;
  children?: BaseReportRow[];
}

interface ReportState<TRow extends BaseReportRow> {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  filters?: TableFilter[];
  expandedRowKeys: string[];
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;
  reportData: TRow[];
  loadedDateRange: { start: Date; end: Date };
  loadedDimensions: string[];
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  loadData: () => Promise<void>;
  setExpandedRowKeys: (keys: string[]) => void;
  loadChildData: (key: string, value: string, depth: number) => Promise<void>;
}

type StoreHook<TRow extends BaseReportRow> = {
  (): ReportState<TRow>;
  getState: () => ReportState<TRow>;
  setState: (partial: Partial<ReportState<TRow>>) => void;
};

interface TimePeriodConfig {
  urlKey: string;
  values: readonly string[];
  defaultValue: string;
  storeKey: string;
}

interface DimensionValidation {
  validKeys: Record<string, string>;
  defaults: string[];
}

export interface UseGenericUrlSyncConfig<TRow extends BaseReportRow> {
  useStore: StoreHook<TRow>;
  fetchData: (params: any) => Promise<TRow[]>;
  defaultSortColumn: string;
  skipDimensions?: boolean;
  defaultStartDate?: Date;
  defaultEndDate?: Date;
  defaultDimensions?: string[];
  timePeriod?: TimePeriodConfig;
  dimensionValidation?: DimensionValidation;
  skipFilters?: boolean;
}

function serializeFilters(filters: TableFilter[]): string | null {
  const valid = filters.filter(f => f.field && f.value);
  if (valid.length === 0) return null;
  return JSON.stringify(valid.map(({ field, operator, value }) => ({ field, operator, value })));
}

function deserializeFilters(raw: string | null): TableFilter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((f: { field: string; operator: string; value: string }, i: number) => ({
      id: `url-${i}-${Date.now()}`,
      field: f.field || '',
      operator: (f.operator || 'equals') as TableFilter['operator'],
      value: f.value || '',
    }));
  } catch {
    return [];
  }
}

export function useGenericUrlSync<TRow extends BaseReportRow>({
  useStore,
  fetchData,
  defaultSortColumn,
  skipDimensions = false,
  defaultStartDate,
  defaultEndDate,
  defaultDimensions,
  timePeriod: timePeriodConfig,
  dimensionValidation,
  skipFilters = false,
}: UseGenericUrlSyncConfig<TRow>): void {
  const getDefaultStart = () => {
    if (defaultStartDate) return defaultStartDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const getDefaultEnd = () => {
    if (defaultEndDate) return defaultEndDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const baseParsers = {
    start: parseAsIsoDate.withDefault(getDefaultStart()),
    end: parseAsIsoDate.withDefault(getDefaultEnd()),
    dimensions: parseAsArrayOf(parseAsString).withDefault(defaultDimensions ?? []),
    expanded: parseAsArrayOf(parseAsString).withDefault([]),
    sortBy: parseAsString.withDefault(defaultSortColumn),
    sortDir: parseAsStringLiteral(['ascend', 'descend'] as const).withDefault('descend'),
    ...(!skipFilters ? { filters: parseAsString.withDefault('') } : {}),
    ...(timePeriodConfig ? {
      [timePeriodConfig.urlKey]: parseAsStringLiteral(
        timePeriodConfig.values as unknown as readonly [string, ...string[]]
      ).withDefault(timePeriodConfig.defaultValue),
    } : {}),
  } as const;

  const [urlState, setUrlState] = useQueryStates(baseParsers, {
    history: 'replace',
    shallow: true,
  });

  const isInitialized = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  const savedExpandedKeys = useRef<string[]>([]);
  const hasRestoredOnce = useRef(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const storeState = useStore();
  const {
    dateRange,
    dimensions,
    expandedRowKeys,
    sortColumn,
    sortDirection,
    reportData,
    setSort,
    loadData,
    setExpandedRowKeys,
  } = storeState;
  const filters = storeState.filters ?? [];

  // Read timePeriod from store if config is provided
  const timePeriodValue = timePeriodConfig
    ? (storeState as any)[timePeriodConfig.storeKey]
    : undefined;

  // Initialize state from URL on mount
  useEffect(() => {
    if (!isMounted || isInitialized.current) return;

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('viewId')) {
      isInitialized.current = true;
      return;
    }

    isInitialized.current = true;
    isUpdatingFromUrl.current = true;

    try {
      if (urlState.start && urlState.end) {
        useStore.setState({
          dateRange: { start: urlState.start, end: urlState.end }
        });
      }

      if (!skipDimensions && urlState.dimensions && urlState.dimensions.length > 0) {
        if (dimensionValidation) {
          const validDimensions = urlState.dimensions.filter(
            (d: string) => d in dimensionValidation.validKeys
          );
          useStore.setState({
            dimensions: validDimensions.length > 0 ? validDimensions : dimensionValidation.defaults,
          });
        } else {
          useStore.setState({ dimensions: urlState.dimensions });
        }
      }

      if (!skipFilters && (urlState as any).filters) {
        const parsedFilters = deserializeFilters((urlState as any).filters);
        if (parsedFilters.length > 0) {
          useStore.setState({ filters: parsedFilters } as Partial<ReportState<TRow>>);
        }
      }

      if (timePeriodConfig && (urlState as any)[timePeriodConfig.urlKey]) {
        useStore.setState({
          [timePeriodConfig.storeKey]: (urlState as any)[timePeriodConfig.urlKey],
        } as Partial<ReportState<TRow>>);
      }

      if (urlState.expanded && urlState.expanded.length > 0) {
        savedExpandedKeys.current = Array.from(new Set(urlState.expanded));
      }

      if (urlState.sortBy) {
        setSort(urlState.sortBy, urlState.sortDir || 'descend');
      }

      queueMicrotask(() => {
        loadData();
      });
    } finally {
      isUpdatingFromUrl.current = false;
    }
  }, [isMounted, loadData, setSort, useStore, urlState]);

  // Restore expanded rows after data loads
  useEffect(() => {
    if (!isMounted || !isInitialized.current || isUpdatingFromUrl.current) return;
    if (hasRestoredOnce.current) return;
    if (savedExpandedKeys.current.length === 0 || reportData.length === 0) return;

    const restoreRows = async () => {
      hasRestoredOnce.current = true;
      const keysToRestore = savedExpandedKeys.current;
      savedExpandedKeys.current = [];

      const state = useStore.getState();

      const { updatedData, validKeys } = await restoreExpandedRows<TRow>({
        savedExpandedKeys: keysToRestore,
        reportData: state.reportData,
        dimensions: state.loadedDimensions,
        skipIfChildrenExist: true,
        fetchChildren: (parentFilters, depth) =>
          fetchData({
            dateRange: state.loadedDateRange,
            dimensions: state.loadedDimensions,
            depth,
            parentFilters,
            sortBy: state.sortColumn || defaultSortColumn || undefined,
            sortDirection: state.sortDirection === 'ascend' ? 'ASC' : 'DESC',
          }),
      });

      useStore.setState({ reportData: updatedData });
      setExpandedRowKeys(validKeys);
    };

    restoreRows();
  }, [reportData.length, isMounted, useStore, fetchData, defaultSortColumn, setExpandedRowKeys]);

  // Update URL when store state changes
  useEffect(() => {
    if (!isMounted || !isInitialized.current || isUpdatingFromUrl.current) return;

    const urlUpdate: Record<string, any> = {
      start: dateRange.start,
      end: dateRange.end,
      dimensions: skipDimensions ? null : (dimensions.length > 0 ? dimensions : null),
      expanded: expandedRowKeys.length > 0 ? Array.from(new Set(expandedRowKeys)) : null,
      sortBy: sortColumn || defaultSortColumn || null,
      sortDir: sortDirection || 'descend',
    };

    if (!skipFilters) {
      urlUpdate.filters = serializeFilters(filters);
    }

    if (timePeriodConfig && timePeriodValue !== undefined) {
      urlUpdate[timePeriodConfig.urlKey] = timePeriodValue;
    }

    setUrlState(urlUpdate);
  }, [
    isMounted,
    dateRange,
    dimensions,
    filters,
    expandedRowKeys,
    sortColumn,
    sortDirection,
    timePeriodValue,
    setUrlState,
    defaultSortColumn,
    skipDimensions,
    skipFilters,
    timePeriodConfig,
  ]);
}
