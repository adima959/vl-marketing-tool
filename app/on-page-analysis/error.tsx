'use client';

import { useEffect } from 'react';
import { Button, Result } from 'antd';

export default function OnPageAnalysisError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('On-page analysis error:', error);
  }, [error]);

  return (
    <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
      <Result
        status="error"
        title="Failed to load on-page analysis"
        subTitle={error.message || 'An error occurred while loading the on-page analysis. Please try again.'}
        extra={[
          <Button type="primary" key="retry" onClick={reset}>
            Retry
          </Button>,
        ]}
      />
    </div>
  );
}
