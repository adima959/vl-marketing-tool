'use client';

import { Suspense, lazy, useEffect } from 'react';
import { Spin } from 'antd';
import { useDashboardUrlSync } from '@/hooks/useDashboardUrlSync';
import { DashboardFilterToolbar } from '@/components/dashboard/DashboardFilterToolbar';
import { DashboardTimeSeriesChart } from '@/components/dashboard/DashboardTimeSeriesChart';
import { PageHeader } from '@/components/layout/PageHeader';
import { LayoutDashboard } from 'lucide-react';
import styles from '@/components/dashboard/dashboard.module.css';

const DashboardDataTable = lazy(() =>
  import('@/components/dashboard/DashboardDataTable').then((mod) => ({ default: mod.DashboardDataTable }))
);

function DashboardContent() {
  useDashboardUrlSync();

  useEffect(() => {
    document.title = 'Dashboard | Vitaliv Analytics';
  }, []);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dashboard"
        icon={<LayoutDashboard className="h-5 w-5" />}
      />
      <div className={styles.content}>
        <DashboardFilterToolbar />
        <DashboardTimeSeriesChart />
        <Suspense fallback={<div className="flex items-center justify-center p-8"><Spin size="large" /></div>}>
          <DashboardDataTable />
        </Suspense>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div />}>
      <DashboardContent />
    </Suspense>
  );
}
