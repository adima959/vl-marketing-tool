'use client';

import { useEffect } from 'react';
import { Button, Result } from 'antd';

export default function MarketingTrackerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Marketing tracker error:', error);
  }, [error]);

  return (
    <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
      <Result
        status="error"
        title="Failed to load marketing tracker"
        subTitle={error.message || 'An error occurred while loading the marketing tracker. Please try again.'}
        extra={[
          <Button type="primary" key="retry" onClick={reset}>
            Retry
          </Button>,
        ]}
      />
    </div>
  );
}
