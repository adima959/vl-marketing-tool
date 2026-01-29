'use client';

import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DashboardDateRangePicker } from './DashboardDateRangePicker';
import { useDashboardStore } from '@/stores/dashboardStore';
import styles from './DashboardFilterToolbar.module.css';

export function DashboardFilterToolbar() {
  const { loadData, isLoading, hasUnsavedChanges, hasLoadedOnce } = useDashboardStore();

  return (
    <div className={styles.toolbar}>
      <div className={styles.mainRow}>
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
  );
}
