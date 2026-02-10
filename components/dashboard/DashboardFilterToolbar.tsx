'use client';

import { DateRangePicker } from '@/components/filters/DateRangePicker';
import { DimensionPills } from '@/components/filters/DimensionPills';
import { LoadDataButton } from '@/components/shared/LoadDataButton';
import { useDashboardStore } from '@/stores/dashboardStore';
import { getCrmDimensionLabel } from '@/config/crmDimensions';
import styles from './dashboard.module.css';

export function DashboardFilterToolbar() {
  const { dimensions, reorderDimensions, dateRange, setDateRange, loadData, isLoading, hasUnsavedChanges, hasLoadedOnce } = useDashboardStore();

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterLeft}>
        <span className={styles.filterLabel}>Dimensions</span>
        <DimensionPills
          dimensions={dimensions}
          reorderDimensions={reorderDimensions}
          getLabel={getCrmDimensionLabel}
          canRemove={false}
        />
      </div>
      <div className={styles.filterRight}>
        <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />
        <LoadDataButton
          isLoading={isLoading}
          hasLoadedOnce={hasLoadedOnce}
          hasUnsavedChanges={hasUnsavedChanges}
          onClick={loadData}
          size="middle"
        />
      </div>
    </div>
  );
}
