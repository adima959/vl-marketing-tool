'use client';

import { DateRangePicker } from './DateRangePicker';
import { DimensionPicker } from './DimensionPicker';
import { DimensionPills } from './DimensionPills';
import { FilterPanel } from './FilterPanel';
import { LoadDataButton } from '@/components/shared/LoadDataButton';
import { useReportStore } from '@/stores/reportStore';
import { getDimensionLabel } from '@/config/dimensions';
import type { TableFilter } from '@/types/filters';
import type { DimensionGroupConfig } from '@/types/dimensions';
import styles from './FilterToolbar.module.css';

interface FilterToolbarProps {
  filters?: TableFilter[];
  onFiltersChange?: (filters: TableFilter[]) => void;
  dimensionGroups?: DimensionGroupConfig[];
}

export function FilterToolbar({ filters, onFiltersChange, dimensionGroups }: FilterToolbarProps) {
  const { dimensions, removeDimension, reorderDimensions, dateRange, setDateRange, loadData, isLoading, hasUnsavedChanges, hasLoadedOnce } = useReportStore();

  const hasEmbeddedFilters = filters !== undefined && onFiltersChange !== undefined && dimensionGroups !== undefined;

  return (
    <div className={styles.toolbar}>
      <div className={styles.mainRow}>
        {/* Left: Dimensions + optional embedded Filters */}
        <div className={hasEmbeddedFilters ? styles.leftColumn : styles.leftSection}>
          <div className={styles.dimensionsWrapper}>
            <span className={styles.dimensionsLabel}>DIMENSIONS:</span>
            <div className={styles.dimensionsContent}>
              <DimensionPills
                dimensions={dimensions}
                reorderDimensions={reorderDimensions}
                removeDimension={removeDimension}
                getLabel={getDimensionLabel}
              />
              <DimensionPicker />
            </div>
          </div>

          {hasEmbeddedFilters && (
            <div className={styles.filtersWrapper}>
              <span className={styles.dimensionsLabel}>FILTERS:</span>
              <div className={styles.filtersContent}>
                <FilterPanel
                  filters={filters}
                  onFiltersChange={onFiltersChange}
                  dimensionGroups={dimensionGroups}
                  embedded
                />
              </div>
            </div>
          )}
        </div>

        {/* Right: Date range and controls */}
        <div className={styles.rightSection}>
          <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />

          <div className={styles.loadButtonWrapper}>
            <LoadDataButton
              isLoading={isLoading}
              hasLoadedOnce={hasLoadedOnce}
              hasUnsavedChanges={hasUnsavedChanges}
              onClick={loadData}
            />
            {hasUnsavedChanges && (
              <span className={styles.unsavedDot} title="Unsaved filter changes" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
