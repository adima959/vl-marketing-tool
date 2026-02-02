'use client';

import { Suspense, useEffect, useRef } from 'react';
import { Button } from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApprovalRateFilterToolbar } from '@/components/approval-rate/ApprovalRateFilterToolbar';
import { ApprovalRateDataTable } from '@/components/approval-rate/ApprovalRateDataTable';
import { useApprovalRateUrlSync } from '@/hooks/useApprovalRateUrlSync';
import { useSidebar } from '@/components/ui/sidebar';
import { useApprovalRateStore } from '@/stores/approvalRateStore';
import { TrendingUp } from 'lucide-react';

function ApprovalRateContent() {
  const { setOpen } = useSidebar();
  const hasCollapsed = useRef(false);
  const { hasUnsavedChanges, resetFilters } = useApprovalRateStore();

  // Auto-collapse sidebar on mount
  useEffect(() => {
    if (!hasCollapsed.current) {
      setOpen(false);
      hasCollapsed.current = true;
    }
  }, [setOpen]);

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
    <div className="flex flex-col h-full overflow-auto">
      <PageHeader
        title="Approval Rate"
        icon={<TrendingUp className="h-5 w-5" />}
        actions={headerActions}
      />
      <div className="flex flex-col gap-3 p-3 bg-white flex-1">
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
