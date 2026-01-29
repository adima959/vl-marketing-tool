'use client';

import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { NewOrdersDateRangePicker } from './NewOrdersDateRangePicker';
import { useNewOrdersStore } from '@/stores/newOrdersStore';
import styles from './NewOrdersFilterToolbar.module.css';

export function NewOrdersFilterToolbar() {
  const { loadData, isLoading, hasUnsavedChanges, hasLoadedOnce } = useNewOrdersStore();

  return (
    <div className={styles.toolbar}>
      <div className={styles.mainRow}>
        <NewOrdersDateRangePicker />

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
