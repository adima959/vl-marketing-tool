'use client';

import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DateRangePicker } from '@/components/filters/DateRangePicker';
import { DimensionPills } from '@/components/filters/DimensionPills';
import { useDashboardStore } from '@/stores/dashboardStore';
import { getDashboardDimensionLabel } from '@/config/dashboardDimensions';
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
          getLabel={getDashboardDimensionLabel}
          canRemove={false}
        />
      </div>
      <div className={styles.filterRight}>
        <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />
        <Button
          type={!hasLoadedOnce || hasUnsavedChanges ? 'primary' : 'default'}
          icon={<ReloadOutlined />}
          onClick={loadData}
          loading={isLoading}
          disabled={hasLoadedOnce && !hasUnsavedChanges}
          size="middle"
        >
          <span className={styles.buttonText}>
            {!hasLoadedOnce ? 'Load Data' : hasUnsavedChanges ? 'Update' : 'Loaded'}
          </span>
        </Button>
      </div>
    </div>
  );
}
