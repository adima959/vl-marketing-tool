'use client';

import { Suspense, lazy } from 'react';
import { Spin } from 'antd';
import { Dashboard2FilterBar } from './Dashboard2FilterBar';
import styles from './dashboard2.module.css';

const Dashboard2DataTable = lazy(() =>
  import('./Dashboard2DataTable').then((mod) => ({ default: mod.Dashboard2DataTable }))
);

export function Dashboard2Page() {
  return (
    <div className={styles.content}>
      <Dashboard2FilterBar />
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spin size="large" /></div>}>
        <Dashboard2DataTable />
      </Suspense>
    </div>
  );
}
