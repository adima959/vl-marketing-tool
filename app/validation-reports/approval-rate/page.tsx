'use client';

import { Suspense, useCallback } from 'react';
import { Button } from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import { ValidationRateFilterToolbar } from '@/components/validation-rate/ValidationRateFilterToolbar';
import { ValidationRateDataTable } from '@/components/validation-rate/ValidationRateDataTable';
import { SavedViewsDropdown } from '@/components/saved-views/SavedViewsDropdown';
import { useValidationRateUrlSync } from '@/hooks/useValidationRateUrlSync';
import { useApprovalRateStore } from '@/stores/approvalRateStore';
import { TrendingUp } from 'lucide-react';
import pageStyles from '@/components/dashboard/dashboard.module.css';
import type { ResolvedViewParams } from '@/types/savedViews';

function ApprovalRateContent() {
  const { hasUnsavedChanges, resetFilters } = useApprovalRateStore();

  // Sync store state with URL parameters and auto-load data
  useValidationRateUrlSync(useApprovalRateStore, 'approval');

  const handleApplyView = useCallback((params: ResolvedViewParams) => {
    const store = useApprovalRateStore.getState();
    useApprovalRateStore.setState({
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

  const getCurrentState = useCallback(() => {
    const { dateRange, dimensions, sortColumn, sortDirection, timePeriod } = useApprovalRateStore.getState();
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
        title="Approval Rate"
        icon={<TrendingUp className="h-5 w-5" />}
        actions={headerActions}
        titleExtra={
          <SavedViewsDropdown
            pagePath="/validation-reports/approval-rate"
            onApplyView={handleApplyView}
            getCurrentState={getCurrentState}
          />
        }
      />
      <div className={pageStyles.content}>
        <ValidationRateFilterToolbar useStore={useApprovalRateStore} />
        <ValidationRateDataTable
          useStore={useApprovalRateStore}
          promptTitle="Ready to analyze approval rates?"
          promptText="Select your dimensions, time period, and date range above, then click &quot;Load Data&quot; to get started."
        />
      </div>
    </div>
  );
}

export default function ApprovalRatePage() {
  return (
    <Suspense fallback={<div />}>
      <ApprovalRateContent />
    </Suspense>
  );
}
