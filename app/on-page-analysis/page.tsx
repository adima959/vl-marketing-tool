'use client';

import { useState, Suspense, useEffect, useRef, useCallback } from 'react';
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

function OnPageAnalysisContent() {
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [unclassifiedCount, setUnclassifiedCount] = useState<number | null>(null);
  const { setOpen } = useSidebar();
  const hasCollapsed = useRef(false);

  const { hasUnsavedChanges, resetFilters, dateRange, filters, setFilters } = useSessionStore();

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
          <SessionFilterToolbar filters={filters} onFiltersChange={setFilters} />
          <TableInfoBanner messages={[
            ...(includesToday ? ["Today's data may be incomplete"] : []),
          ]} />
          <SessionDataTable />
        </div>
      </div>
      <SessionColumnSettingsModal
        open={columnSettingsOpen}
        onClose={() => setColumnSettingsOpen(false)}
      />
    </>
  );
}

export default function OnPageAnalysisPage() {
  return (
    <Suspense fallback={<div />}>
      <OnPageAnalysisContent />
    </Suspense>
  );
}
