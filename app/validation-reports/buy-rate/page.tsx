'use client';

import { Suspense } from 'react';
import { Button } from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import { ValidationRateFilterToolbar } from '@/components/validation-rate/ValidationRateFilterToolbar';
import { ValidationRateDataTable } from '@/components/validation-rate/ValidationRateDataTable';
import { useValidationRateUrlSync } from '@/hooks/useValidationRateUrlSync';
import { useBuyRateStore } from '@/stores/buyRateStore';
import { ShoppingCart } from 'lucide-react';
import pageStyles from '@/components/dashboard/dashboard.module.css';

function BuyRateContent() {
  const { hasUnsavedChanges, resetFilters } = useBuyRateStore();

  // Sync store state with URL parameters and auto-load data
  useValidationRateUrlSync(useBuyRateStore, 'buy');

  const headerActions = (
    <>
      {hasUnsavedChanges && (
        <Button type="text" onClick={resetFilters} size="small">
          Reset
        </Button>
      )}
    </>
  );

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Buy Rate"
        icon={<ShoppingCart className="h-5 w-5" />}
        actions={headerActions}
      />
      <div className={pageStyles.content}>
        <ValidationRateFilterToolbar useStore={useBuyRateStore} />
        <ValidationRateDataTable
          useStore={useBuyRateStore}
          promptTitle="Ready to analyze buy rates?"
          promptText="Select your dimensions, time period, and date range above, then click &quot;Load Data&quot; to get started."
          rateType="buy"
          modalRecordLabel="Invoices"
        />
      </div>
    </div>
  );
}

export default function BuyRatePage() {
  return (
    <Suspense fallback={<div />}>
      <BuyRateContent />
    </Suspense>
  );
}
