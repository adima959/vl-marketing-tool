'use client';

import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DashboardDateRangePicker } from './DashboardDateRangePicker';
import { DashboardDimensionPills } from './DashboardDimensionPills';
import { useDashboardStore } from '@/stores/dashboardStore';
import styles from './DashboardFilterToolbar.module.css';

export function DashboardFilterToolbar() {
  const { loadData, isLoading, hasUnsavedChanges, hasLoadedOnce } = useDashboardStore();

  return (
    <div className={styles.toolbar}>
      <div className={styles.mainRow}>
        {/* Left: Dimensions */}
        <div className={styles.leftSection}>
          <div className={styles.dimensionsWrapper}>
            <span className={styles.dimensionsLabel}>DIMENSIONS:</span>
            <div className={styles.dimensionsContent}>
              <DashboardDimensionPills />
            </div>
          </div>
        </div>

        {/* Right: Date range and controls */}
        <div className={styles.rightSection}>
          <DashboardDateRangePicker />

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
