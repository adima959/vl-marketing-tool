'use client';

import { Suspense } from 'react';
import { Button } from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import { ValidationRateFilterToolbar } from '@/components/validation-rate/ValidationRateFilterToolbar';
import { ValidationRateDataTable } from '@/components/validation-rate/ValidationRateDataTable';
import { useValidationRateUrlSync } from '@/hooks/useValidationRateUrlSync';
import { usePayRateStore } from '@/stores/payRateStore';
import { CreditCard } from 'lucide-react';
import pageStyles from '@/components/dashboard/dashboard.module.css';

function PayRateContent() {
  const { hasUnsavedChanges, resetFilters } = usePayRateStore();

  // Sync store state with URL parameters and auto-load data
  useValidationRateUrlSync(usePayRateStore, 'pay');

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
        title="Pay Rate"
        icon={<CreditCard className="h-5 w-5" />}
        actions={headerActions}
      />
      <div className={pageStyles.content}>
        <ValidationRateFilterToolbar useStore={usePayRateStore} />
        <ValidationRateDataTable
          useStore={usePayRateStore}
          promptTitle="Ready to analyze pay rates?"
          promptText="Select your dimensions, time period, and date range above, then click &quot;Load Data&quot; to get started."
          rateType="pay"
          modalRecordLabel="Invoices"
        />
      </div>
    </div>
  );
}

export default function PayRatePage() {
  return (
    <Suspense fallback={<div />}>
      <PayRateContent />
    </Suspense>
  );
}
