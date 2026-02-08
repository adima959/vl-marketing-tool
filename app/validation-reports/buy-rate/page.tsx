'use client';

import { Suspense, useCallback } from 'react';
import { Button } from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import { ValidationRateFilterToolbar } from '@/components/validation-rate/ValidationRateFilterToolbar';
import { ValidationRateDataTable } from '@/components/validation-rate/ValidationRateDataTable';
import { SavedViewsDropdown } from '@/components/saved-views/SavedViewsDropdown';
import { useValidationRateUrlSync } from '@/hooks/useValidationRateUrlSync';
import { useApplyViewFromUrl } from '@/hooks/useApplyViewFromUrl';
import { useBuyRateStore } from '@/stores/buyRateStore';
import { ShoppingCart } from 'lucide-react';
import pageStyles from '@/components/dashboard/dashboard.module.css';
import type { ResolvedViewParams } from '@/types/savedViews';

function BuyRateContent() {
  const { hasUnsavedChanges, resetFilters } = useBuyRateStore();

  // Sync store state with URL parameters and auto-load data
  useValidationRateUrlSync(useBuyRateStore, 'buy');

  const handleApplyView = useCallback((params: ResolvedViewParams) => {
    const store = useBuyRateStore.getState();
    useBuyRateStore.setState({
      dateRange: { start: params.start, end: params.end },
      ...(params.dimensions && { dimensions: params.dimensions }),
      ...(params.period && { timePeriod: params.period }),
      hasUnsavedChanges: false,
    });
    if (params.sortBy) {
      store.setSort(params.sortBy, params.sortDir ?? 'descend');
    } else {
      store.loadData();
    }
  }, []);

  useApplyViewFromUrl(handleApplyView);

  const getCurrentState = useCallback(() => {
    const { dateRange, dimensions, sortColumn, sortDirection, timePeriod } = useBuyRateStore.getState();
    return { dateRange, dimensions, sortBy: sortColumn, sortDir: sortDirection, period: timePeriod };
  }, []);

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
        titleExtra={
          <SavedViewsDropdown
            pagePath="/validation-reports/buy-rate"
            onApplyView={handleApplyView}
            getCurrentState={getCurrentState}
          />
        }
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
