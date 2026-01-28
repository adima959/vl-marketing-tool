'use client';

import { useNewOrdersUrlSync } from '@/hooks/useNewOrdersUrlSync';
import { NewOrdersDataTable } from '@/components/new-orders/NewOrdersDataTable';

export default function NewOrdersPage() {
  // Automatically syncs URL state with store and loads data
  useNewOrdersUrlSync();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">New Orders</h1>
      </div>

      <NewOrdersDataTable />
    </div>
  );
}
