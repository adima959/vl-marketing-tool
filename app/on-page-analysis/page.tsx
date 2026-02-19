'use client';

import { useState, Suspense, useEffect, useRef, useCallback, lazy } from 'react';
import { Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { SessionFilterToolbar } from '@/components/session-analysis/SessionFilterToolbar';
import { SessionDataTable } from '@/components/session-analysis/SessionDataTable';
import { SessionColumnSettingsModal } from '@/components/session-analysis/SessionColumnSettingsModal';
import { SavedViewsDropdown } from '@/components/saved-views/SavedViewsDropdown';
import { useSessionUrlSync } from '@/hooks/useSessionUrlSync';
import { useApplyViewFromUrl } from '@/hooks/useApplyViewFromUrl';
import { useReportPageSetup } from '@/hooks/useReportPageSetup';
import { useSidebar } from '@/components/ui/sidebar';
import { useSessionStore } from '@/stores/sessionStore';
import { useSessionColumnStore } from '@/stores/sessionColumnStore';
import { SESSION_METRIC_COLUMNS } from '@/config/sessionColumns';

import { TableInfoBanner } from '@/components/ui/TableInfoBanner';
import { fetchUnclassifiedCount } from '@/lib/api/urlClassificationsClient';
import { Eye } from 'lucide-react';
import badgeStyles from '@/styles/components/badge.module.css';
import pageStyles from '@/components/dashboard/dashboard.module.css';
import type { ResolvedViewParams } from '@/types/savedViews';
import type { OnPageViewClickContext } from '@/types/onPageDetails';

const OnPageViewsModal = lazy(() =>
  import('@/components/on-page-analysis/OnPageViewsModal').then((mod) => ({ default: mod.OnPageViewsModal }))
);

function OnPageAnalysisContent() {
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalContext, setDetailModalContext] = useState<OnPageViewClickContext | null>(null);
  const [unclassifiedCount, setUnclassifiedCount] = useState<number | null>(null);
  const { setOpen } = useSidebar();
  const hasCollapsed = useRef(false);

  const { hasUnsavedChanges, resetFilters, dateRange, filters, setFilters } = useSessionStore();

  const handleMetricClick = (context: OnPageViewClickContext) => {
    setDetailModalContext(context);
    setDetailModalOpen(true);
  };

  const handleDetailModalClose = () => {
    setDetailModalOpen(false);
    setTimeout(() => setDetailModalContext(null), 300);
  };

  useSessionUrlSync();

  // Fetch unclassified URL count for badge
  useEffect(() => {
    fetchUnclassifiedCount().then(setUnclassifiedCount).catch(() => {});
  }, []);

  const onApplyView = useCallback((params: ResolvedViewParams) => {
    if (params.visibleColumns) {
      useSessionColumnStore.getState().setVisibleColumns(params.visibleColumns);
    }
  }, []);

  const getExtraState = useCallback(() => ({
    visibleColumns: useSessionColumnStore.getState().visibleColumns,
    totalColumns: SESSION_METRIC_COLUMNS.length,
  }), []);

  const { includesToday, handleApplyView, getCurrentState } = useReportPageSetup({
    dateRange,
    getStoreState: useSessionStore.getState,
    setStoreState: useSessionStore.setState,
    onApplyView,
    getExtraState,
  });

  // Auto-collapse sidebar on mount only once
  useEffect(() => {
    if (!hasCollapsed.current) {
      setOpen(false);
      hasCollapsed.current = true;
    }
  }, [setOpen]);

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
      <Link href="/settings/data-maps?tab=url">
        <Button
          type="text"
          size="small"
        >
          URL Map
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
          title="On-Page Analysis"
          icon={<Eye className="h-5 w-5" />}
          actions={headerActions}
          titleExtra={
            <SavedViewsDropdown
              pagePath="/on-page-analysis"
              onApplyView={handleApplyView}
              getCurrentState={getCurrentState}
            />
          }
        />
        <div className={pageStyles.content}>
          <SessionFilterToolbar
            filters={filters}
            onFiltersChange={setFilters}
            infoBanner={includesToday ? <TableInfoBanner messages={["Today's data may be incomplete"]} /> : undefined}
          />
          <SessionDataTable onMetricClick={handleMetricClick} />
        </div>
      </div>
      <SessionColumnSettingsModal
        open={columnSettingsOpen}
        onClose={() => setColumnSettingsOpen(false)}
      />
      {detailModalOpen && (
        <Suspense fallback={null}>
          <OnPageViewsModal
            open={detailModalOpen}
            onClose={handleDetailModalClose}
            context={detailModalContext}
          />
        </Suspense>
      )}
    </>
  );
}

export default function OnPageAnalysisPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 8 }}>
      <Eye style={{ width: 40, height: 40, color: '#999' }} />
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Maintenance</h2>
      <p style={{ margin: 0, color: '#666' }}>Will be back 20th Feb.</p>
    </div>
  );
}
