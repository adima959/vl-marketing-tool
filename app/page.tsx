'use client';

import { Suspense } from 'react';
import { useDashboardUrlSync } from '@/hooks/useDashboardUrlSync';
import { DashboardDataTable } from '@/components/dashboard/DashboardDataTable';
import { DashboardFilterToolbar } from '@/components/dashboard/DashboardFilterToolbar';
import { PageHeader } from '@/components/layout/PageHeader';
import { LayoutDashboard } from 'lucide-react';

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
          <DashboardDataTable />
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
