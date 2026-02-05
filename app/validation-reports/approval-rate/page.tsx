'use client';

import { Suspense } from 'react';
import { Button } from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApprovalRateFilterToolbar } from '@/components/approval-rate/ApprovalRateFilterToolbar';
import { ApprovalRateDataTable } from '@/components/approval-rate/ApprovalRateDataTable';
import { useApprovalRateUrlSync } from '@/hooks/useApprovalRateUrlSync';
import { useApprovalRateStore } from '@/stores/approvalRateStore';
import { TrendingUp } from 'lucide-react';
import pageStyles from '@/components/dashboard/dashboard.module.css';

function ApprovalRateContent() {
  const { hasUnsavedChanges, resetFilters } = useApprovalRateStore();

  // Sync store state with URL parameters and auto-load data
  useApprovalRateUrlSync();

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
      />
      <div className={pageStyles.content}>
        <ApprovalRateFilterToolbar />
        <ApprovalRateDataTable />
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
