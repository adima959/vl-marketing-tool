'use client';

import { GenericFilterToolbar } from './GenericFilterToolbar';
import { DimensionPicker } from './DimensionPicker';
import { useReportStore } from '@/stores/reportStore';
import { getMarketingDimensionLabel } from '@/config/marketingDimensions';
import type { TableFilter } from '@/types/filters';
import type { DimensionGroupConfig } from '@/types/dimensions';

interface FilterToolbarProps {
  filters?: TableFilter[];
  onFiltersChange?: (filters: TableFilter[]) => void;
  dimensionGroups?: DimensionGroupConfig[];
}

/**
 * Marketing Report filter toolbar
 * Thin wrapper around GenericFilterToolbar with optional FilterPanel support
 */
export function FilterToolbar({ filters, onFiltersChange, dimensionGroups }: FilterToolbarProps) {
  const hasEmbeddedFilters = filters !== undefined && onFiltersChange !== undefined && dimensionGroups !== undefined;

  return (
    <GenericFilterToolbar
      useStore={useReportStore}
      getLabel={getMarketingDimensionLabel}
      dimensionPicker={<DimensionPicker />}
      filterPanel={
        hasEmbeddedFilters
          ? { filters: filters!, onFiltersChange: onFiltersChange!, dimensionGroups: dimensionGroups! }
          : undefined
      }
      showUnsavedDot
    />
  );
}
