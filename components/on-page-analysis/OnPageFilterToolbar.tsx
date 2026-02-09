'use client';

import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DateRangePicker } from '@/components/filters/DateRangePicker';
import { OnPageDimensionPicker } from './OnPageDimensionPicker';
import { DimensionPills } from '@/components/filters/DimensionPills';
import { FilterPanel } from '@/components/filters/FilterPanel';
import { useOnPageStore } from '@/stores/onPageStore';
import { getOnPageDimensionLabel, ON_PAGE_DIMENSION_GROUPS } from '@/config/onPageDimensions';
import type { TableFilter } from '@/types/filters';
import styles from '@/components/filters/FilterToolbar.module.css';

interface OnPageFilterToolbarProps {
  filters: TableFilter[];
  onFiltersChange: (filters: TableFilter[]) => void;
}

export function OnPageFilterToolbar({ filters, onFiltersChange }: OnPageFilterToolbarProps) {
  const { dimensions, removeDimension, reorderDimensions, dateRange, setDateRange, loadData, isLoading, hasUnsavedChanges, hasLoadedOnce } = useOnPageStore();

  return (
    <div className={styles.toolbar}>
      <div className={styles.mainRow}>
        {/* Left: Dimensions + Filters stacked */}
        <div className={styles.leftColumn}>
          <div className={styles.dimensionsWrapper}>
            <span className={styles.dimensionsLabel}>DIMENSIONS:</span>
            <div className={styles.dimensionsContent}>
              <DimensionPills
                dimensions={dimensions}
                reorderDimensions={reorderDimensions}
                removeDimension={removeDimension}
                getLabel={getOnPageDimensionLabel}
              />
              <OnPageDimensionPicker />
            </div>
          </div>

          <div className={styles.filtersWrapper}>
            <span className={styles.dimensionsLabel}>FILTERS:</span>
            <div className={styles.filtersContent}>
              <FilterPanel
                filters={filters}
                onFiltersChange={onFiltersChange}
                dimensionGroups={ON_PAGE_DIMENSION_GROUPS}
                embedded
              />
            </div>
          </div>
        </div>

        {/* Right: Date range and controls */}
        <div className={styles.rightSection}>
          <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />

          <div className={styles.loadButtonWrapper}>
            <Button
              type={!hasLoadedOnce || hasUnsavedChanges ? 'primary' : 'default'}
              icon={<ReloadOutlined />}
              onClick={loadData}
              loading={isLoading}
              disabled={hasLoadedOnce && !hasUnsavedChanges}
            >
              Load Data
            </Button>
            {hasUnsavedChanges && (
              <span className={styles.unsavedDot} title="Unsaved filter changes" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
