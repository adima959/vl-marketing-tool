'use client';

import { Suspense } from 'react';
import { Button } from 'antd';
import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DashboardFilterToolbar } from '@/components/dashboard/DashboardFilterToolbar';
import { DashboardDataTable } from '@/components/dashboard/DashboardDataTable';
import { DashboardTimeSeriesChart } from '@/components/dashboard/DashboardTimeSeriesChart';
import { SavedViewsDropdown } from '@/components/saved-views/SavedViewsDropdown';
import { useDashboardUrlSync } from '@/hooks/useDashboardUrlSync';
import { useApplyViewFromUrl } from '@/hooks/useApplyViewFromUrl';
import { useReportPageSetup } from '@/hooks/useReportPageSetup';
import { useDashboardStore } from '@/stores/dashboardStore';
import { TableInfoBanner } from '@/components/ui/TableInfoBanner';
import pageStyles from '@/components/dashboard/dashboard.module.css';

function DashboardContent() {
  const { hasUnsavedChanges, resetFilters, dateRange, timeSeriesData, isLoading } = useDashboardStore();

  const { includesToday, handleApplyView, getCurrentState } = useReportPageSetup({
    dateRange,
    getStoreState: useDashboardStore.getState,
    setStoreState: useDashboardStore.setState,
  });

  useDashboardUrlSync();
  useApplyViewFromUrl(handleApplyView);

  const headerActions = hasUnsavedChanges ? (
    <Button type="text" onClick={resetFilters} size="small">
      Reset
    </Button>
  ) : null;

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Dashboard"
        icon={<LayoutDashboard className="h-5 w-5" />}
        actions={headerActions}
        titleExtra={
          <SavedViewsDropdown
            pagePath="/"
            onApplyView={handleApplyView}
            getCurrentState={getCurrentState}
          />
        }
      />
      <div className={pageStyles.content}>
        <DashboardFilterToolbar
          infoBanner={includesToday ? <TableInfoBanner messages={["Today's data may be incomplete"]} /> : undefined}
        />
        <DashboardTimeSeriesChart data={timeSeriesData} isLoading={isLoading} />
        <DashboardDataTable />
      </div>
    </div>
  );
}

export default function DashboardClient() {
  return (
    <Suspense fallback={<div />}>
      <DashboardContent />
    </Suspense>
  );
}
