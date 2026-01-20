'use client';

import { Alert, Button } from 'antd';
import styles from './ErrorMessage.module.css';

interface ErrorMessageProps {
  error: string;
  onRetry?: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  return (
    <div className={styles.errorContainer}>
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
