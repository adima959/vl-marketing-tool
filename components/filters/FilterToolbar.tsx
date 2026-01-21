'use client';

import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DateRangePicker } from './DateRangePicker';
import { DimensionPicker } from './DimensionPicker';
import { DimensionPills } from './DimensionPills';
import { useReportStore } from '@/stores/reportStore';
import styles from './FilterToolbar.module.css';

export function FilterToolbar() {
  const { loadData, isLoading, hasUnsavedChanges, hasLoadedOnce } = useReportStore();

  return (
    <div className={styles.toolbar}>
      <div className={styles.mainRow}>
        {/* Left: Dimensions */}
        <div className={styles.leftSection}>
          <div className={styles.dimensionsWrapper}>
            <span className={styles.dimensionsLabel}>DIMENSIONS:</span>
            <div className={styles.dimensionsContent}>
              <DimensionPills />
              <DimensionPicker />
            </div>
          </div>
        </div>

        {/* Right: Date range and controls */}
        <div className={styles.rightSection}>
          <DateRangePicker />

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
