'use client';

import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { OnPageDateRangePicker } from './OnPageDateRangePicker';
import { OnPageDimensionPicker } from './OnPageDimensionPicker';
import { OnPageDimensionPills } from './OnPageDimensionPills';
import { useOnPageStore } from '@/stores/onPageStore';
import styles from '@/components/filters/FilterToolbar.module.css';

export function OnPageFilterToolbar() {
  const { loadData, isLoading, hasUnsavedChanges, hasLoadedOnce } = useOnPageStore();

  return (
    <div className={styles.toolbar}>
      <div className={styles.mainRow}>
        {/* Left: Dimensions */}
        <div className={styles.leftSection}>
          <div className={styles.dimensionsWrapper}>
            <span className={styles.dimensionsLabel}>DIMENSIONS:</span>
            <div className={styles.dimensionsContent}>
              <OnPageDimensionPills />
              <OnPageDimensionPicker />
            </div>
          </div>
        </div>

        {/* Right: Date range and controls */}
        <div className={styles.rightSection}>
          <OnPageDateRangePicker />

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
