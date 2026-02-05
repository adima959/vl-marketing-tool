'use client';

import { useState, Suspense, useEffect, useRef, useMemo, lazy } from 'react';
import { Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { DataTable } from '@/components/table/DataTable';
import { useUrlSync } from '@/hooks/useUrlSync';
import { useSidebar } from '@/components/ui/sidebar';
import { useReportStore } from '@/stores/reportStore';
import { BarChart3 } from 'lucide-react';
import { TableInfoBanner } from '@/components/ui/TableInfoBanner';
import pageStyles from '@/components/dashboard/dashboard.module.css';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';

const ColumnSettingsModal = lazy(() =>
  import('@/components/modals/ColumnSettingsModal').then((mod) => ({ default: mod.ColumnSettingsModal }))
);

const MarketingSubscriptionDetailModal = lazy(() =>
  import('@/components/modals/MarketingSubscriptionDetailModal').then((mod) => ({ default: mod.MarketingSubscriptionDetailModal }))
);

function MarketingReportContent() {
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalContext, setDetailModalContext] = useState<MarketingMetricClickContext | null>(null);
  const { setOpen } = useSidebar();
  const hasCollapsed = useRef(false);
  const { hasUnsavedChanges, resetFilters, dateRange } = useReportStore();

  // Handle CRM metric click to show detail modal
  const handleMarketingMetricClick = (context: MarketingMetricClickContext) => {
    setDetailModalContext(context);
    setDetailModalOpen(true);
  };

  // Handle modal close
  const handleDetailModalClose = () => {
    setDetailModalOpen(false);
    // Keep context briefly for close animation
    setTimeout(() => setDetailModalContext(null), 300);
  };

  // Check if today's date is in the selected range
  const includesToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);
    return today >= start && today <= end;
  }, [dateRange]);

  // Auto-collapse sidebar on mount only once
  useEffect(() => {
    if (!hasCollapsed.current) {
      setOpen(false);
      hasCollapsed.current = true;
    }
  }, [setOpen]);

  // Sync store state with URL parameters and auto-load data
  useUrlSync();

  const headerActions = (
    <>
      {hasUnsavedChanges && (
        <Button
          type="text"
          onClick={resetFilters}
          size="small"
        >
          Reset
        </Button>
      )}
      <Button
        type="text"
        icon={<SettingOutlined />}
        onClick={() => setColumnSettingsOpen(true)}
        size="small"
      >
        Columns
      </Button>
    </>
  );

  return (
    <>
      <div className={pageStyles.page}>
        <PageHeader
          title="Marketing Report"
          icon={<BarChart3 className="h-5 w-5" />}
          actions={headerActions}
        />
        <div className={pageStyles.content}>
          <FilterToolbar />
          {includesToday && (
            <TableInfoBanner message="Today's data may be incomplete" />
          )}
          <DataTable onMarketingMetricClick={handleMarketingMetricClick} />
        </div>
      </div>
      {columnSettingsOpen && (
        <Suspense fallback={null}>
          <ColumnSettingsModal
            open={columnSettingsOpen}
            onClose={() => setColumnSettingsOpen(false)}
          />
        </Suspense>
      )}
      {detailModalOpen && (
        <Suspense fallback={null}>
          <MarketingSubscriptionDetailModal
            open={detailModalOpen}
            onClose={handleDetailModalClose}
            context={detailModalContext}
          />
        </Suspense>
      )}
    </>
  );
}

export default function MarketingReportPage() {
  return (
    <Suspense fallback={<div />}>
      <MarketingReportContent />
    </Suspense>
  );
}
