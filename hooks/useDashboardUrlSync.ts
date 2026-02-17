'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useQueryStates,
  createParser,
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import { formatLocalDate } from '@/lib/types/api';
import { useDashboardStore } from '@/stores/dashboardStore';
import { SALES_DIMENSIONS, type SalesDimension } from '@/types/sales';

/**
 * Local-timezone-safe date parser for URL query strings.
 * Same as useGenericUrlSync — avoids UTC shift from toISOString.
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

const VALID_DIMENSION_IDS = new Set(SALES_DIMENSIONS.map((d) => d.id));
const DEFAULT_DIMENSIONS: SalesDimension[] = ['country', 'productGroup', 'product', 'source'];

function getDefaultDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Syncs dashboard store state ↔ URL query parameters.
 * Handles initialization from URL on mount and updates URL on state change.
 */
export function useDashboardUrlSync(): void {
  const [urlState, setUrlState] = useQueryStates(
    {
      start: parseAsLocalDate.withDefault(getDefaultDate()),
      end: parseAsLocalDate.withDefault(getDefaultDate()),
      dimensions: parseAsArrayOf(parseAsString).withDefault(DEFAULT_DIMENSIONS),
      expanded: parseAsArrayOf(parseAsString).withDefault([]),
      sortBy: parseAsString.withDefault('subscriptions'),
      sortDir: parseAsStringLiteral(['ascend', 'descend'] as const).withDefault('descend'),
    },
    { history: 'replace', shallow: true },
  );

  const isInitialized = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  const {
    dateRange,
    dimensions,
    expandedRowKeys,
    sortColumn,
    sortDirection,
    setSort,
    loadData,
    setExpandedRowKeys,
  } = useDashboardStore();

  // Initialize from URL on mount
  useEffect(() => {
    if (!isMounted || isInitialized.current) return;
    isInitialized.current = true;

    // Skip if saved view will handle init
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('viewId')) {
      return;
    }

    isUpdatingFromUrl.current = true;

    try {
      const updates: Record<string, unknown> = {};

      if (urlState.start && urlState.end) {
        updates.dateRange = { start: urlState.start, end: urlState.end };
      }

      if (urlState.dimensions?.length > 0) {
        const valid = urlState.dimensions.filter((d): d is SalesDimension =>
          VALID_DIMENSION_IDS.has(d as SalesDimension)
        );
        updates.dimensions = valid.length > 0 ? valid : DEFAULT_DIMENSIONS;
      }

      if (urlState.expanded?.length > 0) {
        updates.expandedRowKeys = Array.from(new Set(urlState.expanded));
      }

      useDashboardStore.setState(updates);

      if (urlState.sortBy) {
        setSort(urlState.sortBy, urlState.sortDir || 'descend');
      }

      queueMicrotask(() => { loadData(); });
    } finally {
      isUpdatingFromUrl.current = false;
    }
  }, [isMounted, loadData, setSort, urlState]);

  // Update URL when store state changes
  useEffect(() => {
    if (!isMounted || !isInitialized.current || isUpdatingFromUrl.current) return;

    setUrlState({
      start: dateRange.start,
      end: dateRange.end,
      dimensions: dimensions.length > 0 ? dimensions : null,
      expanded: expandedRowKeys.length > 0 ? Array.from(new Set(expandedRowKeys)) : null,
      sortBy: sortColumn || 'subscriptions',
      sortDir: sortDirection || 'descend',
    });
  }, [
    isMounted,
    dateRange,
    dimensions,
    expandedRowKeys,
    sortColumn,
    sortDirection,
    setUrlState,
  ]);
}
