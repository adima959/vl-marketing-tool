'use client';

import { Suspense, lazy } from 'react';
import { Spin } from 'antd';
import { useDashboardUrlSync } from '@/hooks/useDashboardUrlSync';
import { DashboardFilterToolbar } from '@/components/dashboard/DashboardFilterToolbar';
import { PageHeader } from '@/components/layout/PageHeader';
import { LayoutDashboard } from 'lucide-react';

// Lazy load the heavy data table component
const DashboardDataTable = lazy(() =>
  import('@/components/dashboard/DashboardDataTable').then((mod) => ({ default: mod.DashboardDataTable }))
);

function DashboardContent() {
  // Automatically syncs URL state with store and loads data
  useDashboardUrlSync();

  return (
    <>
      <PageHeader
        title="Dashboard"
        icon={<LayoutDashboard className="h-5 w-5" />}
      />
      <div className="flex flex-col h-full">
        <div className="flex flex-col gap-3 p-3 bg-white flex-1 overflow-auto">
          <DashboardFilterToolbar />
          <Suspense fallback={<div className="flex items-center justify-center p-8"><Spin size="large" /></div>}>
            <DashboardDataTable />
          </Suspense>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div />}>
      <DashboardContent />
    </Suspense>
  );
}
