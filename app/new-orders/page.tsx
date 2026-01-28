'use client';

import { Suspense } from 'react';
import { useNewOrdersUrlSync } from '@/hooks/useNewOrdersUrlSync';
import { NewOrdersDataTable } from '@/components/new-orders/NewOrdersDataTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { ShoppingCart } from 'lucide-react';

function NewOrdersContent() {
  // Automatically syncs URL state with store and loads data
  useNewOrdersUrlSync();

  return (
    <>
      <PageHeader
        title="New Orders"
        icon={<ShoppingCart className="h-5 w-5" />}
      />
      <div className="flex flex-col h-full">
        <div className="flex flex-col gap-3 p-3 bg-white flex-1 overflow-auto">
          <NewOrdersDataTable />
        </div>
      </div>
    </>
  );
}

export default function NewOrdersPage() {
  return (
    <Suspense fallback={<div />}>
      <NewOrdersContent />
    </Suspense>
  );
}
