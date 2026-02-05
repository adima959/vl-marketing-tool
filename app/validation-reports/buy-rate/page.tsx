'use client';

import { PageHeader } from '@/components/layout/PageHeader';
import { ShoppingCart } from 'lucide-react';

export default function BuyRatePage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <PageHeader
        title="Buy Rate"
        icon={<ShoppingCart className="h-5 w-5" />}
      />
      <div className="flex flex-col gap-3 p-3 bg-white flex-1">
        <div className="flex items-center justify-center h-64 text-gray-400">
          Coming soon
        </div>
      </div>
    </div>
  );
}
