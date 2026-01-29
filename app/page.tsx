'use client';

import { Suspense } from 'react';
import { useNewOrdersUrlSync } from '@/hooks/useNewOrdersUrlSync';
import { NewOrdersDataTable } from '@/components/new-orders/NewOrdersDataTable';
import { NewOrdersFilterToolbar } from '@/components/new-orders/NewOrdersFilterToolbar';
import { PageHeader } from '@/components/layout/PageHeader';
import { LayoutDashboard } from 'lucide-react';

function DashboardContent() {
  // Automatically syncs URL state with store and loads data
  useNewOrdersUrlSync();

  return (
    <>
      <PageHeader
        title="Dashboard"
        icon={<LayoutDashboard className="h-5 w-5" />}
      />
      <div className="flex flex-col h-full">
        <div className="flex flex-col gap-3 p-3 bg-white flex-1 overflow-auto">
          <NewOrdersFilterToolbar />
          <NewOrdersDataTable />
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
