import { useCallback } from 'react';
import { fetchValidationRateData } from '@/lib/api/validationRateClient';
import type { ValidationRateType, ValidationRateRow, ValidationRateStore } from '@/types';
import type { UseBoundStore, StoreApi } from 'zustand';
import {
  DEFAULT_VALIDATION_RATE_DIMENSIONS,
  VALIDATION_RATE_DIMENSION_COLUMN_MAP,
} from '@/config/validationRateDimensions';
import { useGenericUrlSync } from '@/hooks/useGenericUrlSync';

function getDefaultStartDate(): Date {
  const today = new Date();
  today.setDate(today.getDate() - 90);
  today.setHours(0, 0, 0, 0);
  return today;
}

export function useValidationRateUrlSync(
  useStore: UseBoundStore<StoreApi<ValidationRateStore>>,
  rateType: ValidationRateType
): void {
  const fetchChildren = useCallback(
    async (params: {
      dateRange: { start: Date; end: Date };
      dimensions: string[];
      depth: number;
      parentFilters?: Record<string, string>;
      sortBy?: string;
      sortDirection?: 'ASC' | 'DESC';
    }): Promise<ValidationRateRow[]> => {
      const state = useStore.getState();
      const { data } = await fetchValidationRateData({
        rateType,
        dateRange: params.dateRange,
        dimensions: params.dimensions,
        depth: params.depth,
        parentFilters: params.parentFilters,
        timePeriod: state.loadedTimePeriod,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
      });
      return data;
    },
    [rateType, useStore]
  );

  useGenericUrlSync<ValidationRateRow>({
    useStore: useStore as any,
    fetchData: fetchChildren,
    defaultSortColumn: '',
    defaultStartDate: getDefaultStartDate(),
    defaultEndDate: new Date(),
    defaultDimensions: DEFAULT_VALIDATION_RATE_DIMENSIONS,
    skipFilters: true,
    timePeriod: {
      urlKey: 'period',
      values: ['weekly', 'biweekly', 'monthly'] as const,
      defaultValue: 'monthly',
      storeKey: 'timePeriod',
    },
    dimensionValidation: {
      validKeys: VALIDATION_RATE_DIMENSION_COLUMN_MAP,
      defaults: DEFAULT_VALIDATION_RATE_DIMENSIONS,
    },
  });
}
