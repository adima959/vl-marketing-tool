'use client';

import { Empty, Button } from 'antd';

interface EmptyStateProps {
  onLoadData?: () => void;
}

export function EmptyState({ onLoadData }: EmptyStateProps) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
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
