'use client';

import { useState, Suspense, useEffect, lazy } from 'react';
import { Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { DataTable } from '@/components/table/DataTable';
import { SavedViewsDropdown } from '@/components/saved-views/SavedViewsDropdown';
import { useUrlSync } from '@/hooks/useUrlSync';
import { useApplyViewFromUrl } from '@/hooks/useApplyViewFromUrl';
import { useReportPageSetup } from '@/hooks/useReportPageSetup';
import { useReportStore } from '@/stores/reportStore';
import { MARKETING_DIMENSION_GROUPS } from '@/config/marketingDimensions';
import { BarChart3 } from 'lucide-react';
import { TableInfoBanner } from '@/components/ui/TableInfoBanner';
import { fetchUnclassifiedCount } from '@/lib/api/campaignClassificationsClient';
import badgeStyles from '@/styles/components/badge.module.css';
import pageStyles from '@/components/dashboard/dashboard.module.css';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';

const ColumnSettingsModal = lazy(() =>
  import('@/components/modals/ColumnSettingsModal').then((mod) => ({ default: mod.ColumnSettingsModal }))
);

const CrmDetailModal = lazy(() =>
  import('@/components/modals/CrmDetailModal').then((mod) => ({ default: mod.CrmDetailModal }))
);

function MarketingReportContent() {
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalContext, setDetailModalContext] = useState<MarketingMetricClickContext | null>(null);
  const [unclassifiedCount, setUnclassifiedCount] = useState<number | null>(null);
  const { hasUnsavedChanges, resetFilters, dateRange, filters, setFilters } = useReportStore();

  // Fetch unclassified campaign count for badge
  useEffect(() => {
    fetchUnclassifiedCount().then(setUnclassifiedCount).catch(() => {});
  }, []);

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

  const { includesToday, handleApplyView, getCurrentState } = useReportPageSetup({
    dateRange,
    getStoreState: useReportStore.getState,
    setStoreState: useReportStore.setState,
  });

  // Sync store state with URL parameters and auto-load data
  useUrlSync();

  useApplyViewFromUrl(handleApplyView);

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
      <Link href="/settings/data-maps?tab=campaign">
        <Button
          type="text"
          size="small"
        >
          Campaign Map
          {unclassifiedCount != null && unclassifiedCount > 0 && (
            <span className={badgeStyles.countBadge}>
              {unclassifiedCount}
            </span>
          )}
        </Button>
      </Link>
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
          titleExtra={
            <SavedViewsDropdown
              pagePath="/marketing-report"
              onApplyView={handleApplyView}
              getCurrentState={getCurrentState}
            />
          }
        />
        <div className={pageStyles.content}>
          <FilterToolbar
            filters={filters}
            onFiltersChange={setFilters}
            dimensionGroups={MARKETING_DIMENSION_GROUPS}
          />
          {includesToday && (
            <TableInfoBanner messages={["Today's data may be incomplete"]} />
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
          <CrmDetailModal
            open={detailModalOpen}
            onClose={handleDetailModalClose}
            variant="marketing"
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
