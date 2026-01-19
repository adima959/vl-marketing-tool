'use client';

import { Alert, Button } from 'antd';

interface ErrorMessageProps {
  error: string;
  onRetry?: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  return (
    <div style={{ padding: 24 }}>
      <Alert
        type="error"
        title="Error Loading Data"
        description={error}
        showIcon
        action={
          onRetry && (
            <Button size="small" danger onClick={onRetry}>
              Retry
            </Button>
          )
        }
      />
    </div>
  );
}
