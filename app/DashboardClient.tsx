'use client';

import { Suspense, lazy, useEffect, useCallback } from 'react';
import { Spin } from 'antd';
import { useDashboardUrlSync } from '@/hooks/useDashboardUrlSync';
import { useApplyViewFromUrl } from '@/hooks/useApplyViewFromUrl';
import { DashboardFilterToolbar } from '@/components/dashboard/DashboardFilterToolbar';
import { DashboardTimeSeriesChart } from '@/components/dashboard/DashboardTimeSeriesChart';
import { PageHeader } from '@/components/layout/PageHeader';
import { SavedViewsDropdown } from '@/components/saved-views/SavedViewsDropdown';
import { useDashboardStore } from '@/stores/dashboardStore';
import { LayoutDashboard } from 'lucide-react';
import styles from '@/components/dashboard/dashboard.module.css';
import type { ResolvedViewParams } from '@/types/savedViews';

const DashboardDataTable = lazy(() =>
  import('@/components/dashboard/DashboardDataTable').then((mod) => ({ default: mod.DashboardDataTable }))
);

function DashboardContent() {
  useDashboardUrlSync();

  useEffect(() => {
    document.title = 'Dashboard | Vitaliv Analytics';
  }, []);

  const handleApplyView = useCallback((params: ResolvedViewParams) => {
    const store = useDashboardStore.getState();
    useDashboardStore.setState({
      dateRange: { start: params.start, end: params.end },
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
    const { dateRange, sortColumn, sortDirection } = useDashboardStore.getState();
    return { dateRange, dimensions: ['country', 'product', 'source'], sortBy: sortColumn, sortDir: sortDirection };
  }, []);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dashboard"
        icon={<LayoutDashboard className="h-5 w-5" />}
        titleExtra={
          <SavedViewsDropdown
            pagePath="/"
            onApplyView={handleApplyView}
            getCurrentState={getCurrentState}
          />
        }
      />
      <div className={styles.content}>
        <DashboardFilterToolbar />
        <DashboardTimeSeriesChart />
        <Suspense fallback={<div className="flex items-center justify-center p-8"><Spin size="large" /></div>}>
          <DashboardDataTable />
        </Suspense>
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
