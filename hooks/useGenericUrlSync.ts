import { useEffect, useRef, useState } from 'react';
import {
  useQueryStates,
  createParser,
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import type { TableFilter } from '@/types/filters';
import { restoreExpandedRows } from '@/lib/utils/treeUtils';
import { formatLocalDate } from '@/lib/types/api';

/**
 * Local-timezone-safe date parser for URL query strings.
 * nuqs's built-in parseAsIsoDate uses toISOString().slice(0,10) which shifts
 * dates back by 1 day in UTC+ timezones (e.g. CET). This parser uses
 * formatLocalDate for serialization and constructs dates at local midnight.
 */
const parseAsLocalDate = createParser({
  parse: (v: string) => {
    const match = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.valueOf() === date.valueOf() ? date : null;
  },
  serialize: (v: Date) => formatLocalDate(v),
  eq: (a: Date, b: Date) => a.getTime() === b.getTime(),
});

const EMPTY_FILTERS: TableFilter[] = [];

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

/**
 * Pure function: read URL state + config → store updates to apply on init.
 * Returns null if the URL contains a viewId (saved-view will handle init).
 */
function buildInitialStateFromUrl<TRow extends BaseReportRow>(
  urlState: Record<string, any>,
  config: Pick<UseGenericUrlSyncConfig<TRow>, 'skipDimensions' | 'skipFilters' | 'timePeriod' | 'dimensionValidation'>
): { storeUpdates: Partial<ReportState<TRow>>; savedExpandedKeys: string[] } | null {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('viewId')) {
    return null;
  }

  const storeUpdates: Partial<ReportState<TRow>> = {};

  if (urlState.start && urlState.end) {
    storeUpdates.dateRange = { start: urlState.start, end: urlState.end };
  }

  if (!config.skipDimensions && urlState.dimensions?.length > 0) {
    if (config.dimensionValidation) {
      const valid = urlState.dimensions.filter((d: string) => d in config.dimensionValidation!.validKeys);
      storeUpdates.dimensions = valid.length > 0 ? valid : config.dimensionValidation.defaults;
    } else {
      storeUpdates.dimensions = urlState.dimensions;
    }
  }

  if (!config.skipFilters && urlState.filters) {
    const parsed = deserializeFilters(urlState.filters);
    if (parsed.length > 0) {
      (storeUpdates as any).filters = parsed;
    }
  }

  if (config.timePeriod && urlState[config.timePeriod.urlKey]) {
    (storeUpdates as any)[config.timePeriod.storeKey] = urlState[config.timePeriod.urlKey];
  }

  const savedExpandedKeys = urlState.expanded?.length > 0
    ? Array.from(new Set<string>(urlState.expanded))
    : [];

  return { storeUpdates, savedExpandedKeys };
}

/**
 * Pure function: store state + config → URL update object.
 */
function buildUrlUpdateFromState<TRow extends BaseReportRow>(
  state: {
    dateRange: { start: Date; end: Date };
    dimensions: string[];
    filters: TableFilter[];
    expandedRowKeys: string[];
    sortColumn: string | null;
    sortDirection: 'ascend' | 'descend' | null;
    timePeriodValue?: string;
  },
  config: Pick<UseGenericUrlSyncConfig<TRow>, 'skipDimensions' | 'skipFilters' | 'timePeriod' | 'defaultSortColumn'>
): Record<string, any> {
  const update: Record<string, any> = {
    start: state.dateRange.start,
    end: state.dateRange.end,
    dimensions: config.skipDimensions ? null : (state.dimensions.length > 0 ? state.dimensions : null),
    expanded: state.expandedRowKeys.length > 0 ? Array.from(new Set(state.expandedRowKeys)) : null,
    sortBy: state.sortColumn || config.defaultSortColumn || null,
    sortDir: state.sortDirection || 'descend',
  };

  if (!config.skipFilters) {
    update.filters = serializeFilters(state.filters);
  }

  if (config.timePeriod && state.timePeriodValue !== undefined) {
    update[config.timePeriod.urlKey] = state.timePeriodValue;
  }

  return update;
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
    start: parseAsLocalDate.withDefault(getDefaultStart()),
    end: parseAsLocalDate.withDefault(getDefaultEnd()),
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
  const filters = storeState.filters ?? EMPTY_FILTERS;

  // Read timePeriod from store if config is provided
  const timePeriodValue = timePeriodConfig
    ? (storeState as any)[timePeriodConfig.storeKey]
    : undefined;

  // Initialize state from URL on mount
  useEffect(() => {
    if (!isMounted || isInitialized.current) return;
    isInitialized.current = true;

    const result = buildInitialStateFromUrl<TRow>(urlState, {
      skipDimensions, skipFilters, timePeriod: timePeriodConfig, dimensionValidation,
    });
    if (!result) return; // viewId present — saved-view handles init

    isUpdatingFromUrl.current = true;
    try {
      useStore.setState(result.storeUpdates);
      savedExpandedKeys.current = result.savedExpandedKeys;

      if (urlState.sortBy) {
        setSort(urlState.sortBy, urlState.sortDir || 'descend');
      }

      queueMicrotask(() => { loadData(); });
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

    setUrlState(buildUrlUpdateFromState<TRow>(
      { dateRange, dimensions, filters, expandedRowKeys, sortColumn, sortDirection, timePeriodValue },
      { skipDimensions, skipFilters, timePeriod: timePeriodConfig, defaultSortColumn },
    ));
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
