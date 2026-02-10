'use client';

import { useEffect } from 'react';
import { Button, Result } from 'antd';

export default function ValidationReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Validation reports error:', error);
  }, [error]);

  return (
    <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
      <Result
        status="error"
        title="Failed to load validation reports"
        subTitle={error.message || 'An error occurred while loading the validation reports. Please try again.'}
        extra={[
          <Button type="primary" key="retry" onClick={reset}>
            Retry
          </Button>,
        ]}
      />
    </div>
  );
}
