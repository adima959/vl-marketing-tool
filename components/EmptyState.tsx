'use client';

import { Empty, Button } from 'antd';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  onLoadData?: () => void;
}

export function EmptyState({ onLoadData }: EmptyStateProps) {
  return (
    <div className={styles.emptyContainer}>
      <Empty
        description="No data available for the selected filters"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      >
        {onLoadData && (
          <Button type="primary" onClick={onLoadData}>
            Load Data
          </Button>
        )}
      </Empty>
    </div>
  );
}
