'use client';

import { GenericFilterToolbar } from '@/components/filters/GenericFilterToolbar';
import { OnPageDimensionPicker } from './OnPageDimensionPicker';
import { useOnPageStore } from '@/stores/onPageStore';
import { getOnPageDimensionLabel, ON_PAGE_DIMENSION_GROUPS } from '@/config/onPageDimensions';
import type { TableFilter } from '@/types/filters';

interface OnPageFilterToolbarProps {
  filters: TableFilter[];
  onFiltersChange: (filters: TableFilter[]) => void;
}

/**
 * On-Page Analysis filter toolbar
 * Thin wrapper around GenericFilterToolbar with always-visible FilterPanel
 */
export function OnPageFilterToolbar({ filters, onFiltersChange }: OnPageFilterToolbarProps) {
  return (
    <GenericFilterToolbar
      useStore={useOnPageStore}
      getLabel={getOnPageDimensionLabel}
      dimensionPicker={<OnPageDimensionPicker />}
      filterPanel={{
        filters,
        onFiltersChange,
        dimensionGroups: ON_PAGE_DIMENSION_GROUPS,
      }}
      showUnsavedDot
    />
  );
}
