'use client';

import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DashboardDateRangePicker } from './DashboardDateRangePicker';
import { DashboardDimensionPills } from './DashboardDimensionPills';
import { useDashboardStore } from '@/stores/dashboardStore';
import styles from './dashboard.module.css';

export function DashboardFilterToolbar() {
  const { loadData, isLoading, hasUnsavedChanges, hasLoadedOnce } = useDashboardStore();

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterLeft}>
        <span className={styles.filterLabel}>Dimensions</span>
        <DashboardDimensionPills />
      </div>
      <div className={styles.filterRight}>
        <DashboardDateRangePicker />
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
