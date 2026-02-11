'use client';

import { ReactNode } from 'react';
import { DateRangePicker } from './DateRangePicker';
import { DimensionPills } from './DimensionPills';
import { FilterPanel } from './FilterPanel';
import { LoadDataButton } from '@/components/shared/LoadDataButton';
import type { TableFilter } from '@/types/filters';
import type { DimensionGroupConfig } from '@/types/dimensions';
import styles from './FilterToolbar.module.css';

interface DateRange {
  start: Date;
  end: Date;
}

interface FilterToolbarStore {
  dimensions: string[];
  removeDimension?: (id: string) => void;
  reorderDimensions: (dimensions: string[]) => void;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  loadData: () => void | Promise<void>;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  hasLoadedOnce: boolean;
}

interface GenericFilterToolbarProps {
  /** Store hook or object containing toolbar state */
  useStore: () => FilterToolbarStore;

  /** Function to get display label for dimensions */
  getLabel: (id: string) => string;

  /** Dimension picker component (optional) */
  dimensionPicker?: ReactNode;

  /** Whether pills can be removed */
  canRemoveDimensions?: boolean;

  /** Optional filter panel configuration */
  filterPanel?: {
    filters: TableFilter[];
    onFiltersChange: (filters: TableFilter[]) => void;
    dimensionGroups: DimensionGroupConfig[];
  };

  /** Custom date picker component (replaces default DateRangePicker) */
  customDatePicker?: ReactNode;

  /** Additional controls to show in right section (e.g., TimePeriodToggle) */
  additionalControls?: ReactNode;

  /** Custom CSS module for styling (optional) */
  styleModule?: {
    filterBar?: string;
    filterLeft?: string;
    filterRight?: string;
    filterLabel?: string;
  };

  /** Show unsaved changes dot indicator */
  showUnsavedDot?: boolean;
}

/**
 * Generic filter toolbar - unified component supporting all dashboard toolbars
 * Configurable for different pages with optional features
 *
 * @example Dashboard (simplest)
 * ```tsx
 * <GenericFilterToolbar
 *   useStore={() => useDashboardStore()}
 *   getLabel={getCrmDimensionLabel}
 *   canRemoveDimensions={false}
 * />
 * ```
 *
 * @example Marketing with optional FilterPanel
 * ```tsx
 * <GenericFilterToolbar
 *   useStore={() => useReportStore()}
 *   getLabel={getMarketingDimensionLabel}
 *   dimensionPicker={<DimensionPicker />}
 *   filterPanel={filters ? { filters, onFiltersChange, dimensionGroups } : undefined}
 *   showUnsavedDot
 * />
 * ```
 *
 * @example ValidationRate with custom date picker and period toggle
 * ```tsx
 * <GenericFilterToolbar
 *   useStore={() => useValidationRateStore()}
 *   getLabel={getValidationRateDimensionLabel}
 *   dimensionPicker={<ValidationRateDimensionPicker useStore={useStore} />}
 *   customDatePicker={<RangePicker ... />}
 *   additionalControls={<TimePeriodToggle useStore={useStore} />}
 *   showUnsavedDot
 * />
 * ```
 */
export function GenericFilterToolbar({
  useStore,
  getLabel,
  dimensionPicker,
  canRemoveDimensions = true,
  filterPanel,
  customDatePicker,
  additionalControls,
  styleModule,
  showUnsavedDot = false,
}: GenericFilterToolbarProps) {
  const {
    dimensions,
    removeDimension,
    reorderDimensions,
    dateRange,
    setDateRange,
    loadData,
    isLoading,
    hasUnsavedChanges,
    hasLoadedOnce,
  } = useStore();

  // Use custom styles if provided, otherwise use default
  const toolbarClass = styleModule?.filterBar || styles.toolbar;
  const leftClass = filterPanel ? styles.leftColumn : styleModule?.filterLeft || styles.leftSection;
  const rightClass = styleModule?.filterRight || styles.rightSection;
  const labelClass = styleModule?.filterLabel || styles.dimensionsLabel;

  return (
    <div className={toolbarClass}>
      <div className={styles.mainRow}>
        {/* Left: Dimensions + optional Filters */}
        <div className={leftClass}>
          <div className={styles.dimensionsWrapper}>
            <span className={labelClass}>DIMENSIONS{styleModule ? '' : ':'}</span>
            <div className={styles.dimensionsContent}>
              <DimensionPills
                dimensions={dimensions}
                reorderDimensions={reorderDimensions}
                removeDimension={canRemoveDimensions ? removeDimension : undefined}
                getLabel={getLabel}
              />
              {dimensionPicker}
            </div>
          </div>

          {filterPanel && (
            <div className={styles.filtersWrapper}>
              <span className={labelClass}>FILTERS:</span>
              <div className={styles.filtersContent}>
                <FilterPanel
                  filters={filterPanel.filters}
                  onFiltersChange={filterPanel.onFiltersChange}
                  dimensionGroups={filterPanel.dimensionGroups}
                  embedded
                />
              </div>
            </div>
          )}
        </div>

        {/* Right: Date range and controls */}
        <div className={rightClass}>
          {customDatePicker || <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />}

          <div className={styles.loadButtonWrapper}>
            <LoadDataButton
              isLoading={isLoading}
              hasLoadedOnce={hasLoadedOnce}
              hasUnsavedChanges={hasUnsavedChanges}
              onClick={loadData}
              size={styleModule ? 'middle' : undefined}
            />
            {showUnsavedDot && hasUnsavedChanges && (
              <span className={styles.unsavedDot} title="Unsaved filter changes" />
            )}
          </div>

          {additionalControls}
        </div>
      </div>
    </div>
  );
}
