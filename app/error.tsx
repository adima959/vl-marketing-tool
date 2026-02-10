'use client';

import { useEffect } from 'react';
import { Button, Result } from 'antd';
import { colors } from '@/styles/tokens';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: colors.background.secondary,
        padding: 24,
      }}
    >
      <Result
        status="error"
        title="Something went wrong!"
        subTitle={error.message || 'An unexpected error occurred. Please try again.'}
        extra={[
          <Button type="primary" key="retry" onClick={reset}>
            Try again
          </Button>,
        ]}
      />
    </div>
  );
}
