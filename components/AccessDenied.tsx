'use client';

import { Result } from 'antd';

interface AccessDeniedProps {
  feature?: string;
}

export function AccessDenied({ feature }: AccessDeniedProps): React.ReactElement {
  return (
    <Result
      status="403"
      title="Access Denied"
      subTitle={
        feature
          ? `You don't have permission to access ${feature}. Contact your administrator to request access.`
          : "You don't have permission to access this page. Contact your administrator to request access."
      }
    />
  );
}
