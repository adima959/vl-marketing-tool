'use client';

import { useState, Suspense, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from 'antd';
import { SettingOutlined, LinkOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { OnPageFilterToolbar } from '@/components/on-page-analysis/OnPageFilterToolbar';
import { OnPageDataTable } from '@/components/on-page-analysis/OnPageDataTable';
import { OnPageColumnSettingsModal } from '@/components/on-page-analysis/OnPageColumnSettingsModal';
import { UrlClassificationModal } from '@/components/on-page-analysis/UrlClassificationModal';
import { SavedViewsDropdown } from '@/components/saved-views/SavedViewsDropdown';
import { useOnPageUrlSync } from '@/hooks/useOnPageUrlSync';
import { useApplyViewFromUrl } from '@/hooks/useApplyViewFromUrl';
import { useSidebar } from '@/components/ui/sidebar';
import { useOnPageStore } from '@/stores/onPageStore';
import { useOnPageColumnStore } from '@/stores/onPageColumnStore';
import { ON_PAGE_METRIC_COLUMNS } from '@/config/onPageColumns';

import { TableInfoBanner } from '@/components/ui/TableInfoBanner';
import { Eye } from 'lucide-react';
import pageStyles from '@/components/dashboard/dashboard.module.css';
import type { ResolvedViewParams } from '@/types/savedViews';
import type { TableFilter } from '@/types/filters';

function OnPageAnalysisContent() {
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [urlClassificationOpen, setUrlClassificationOpen] = useState(false);
  const [unclassifiedCount, setUnclassifiedCount] = useState<number | null>(null);
  const { setOpen } = useSidebar();
  const hasCollapsed = useRef(false);
  const { hasUnsavedChanges, resetFilters, dateRange, filters, setFilters } = useOnPageStore();

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
  useOnPageUrlSync();

  const handleApplyView = useCallback((params: ResolvedViewParams) => {
    const store = useOnPageStore.getState();
    const viewFilters = params.filters
      ? params.filters.map((f, i) => ({
          id: `view-${i}-${Date.now()}`,
          field: f.field,
          operator: f.operator as TableFilter['operator'],
          value: f.value,
        }))
      : [];
    useOnPageStore.setState({
      dateRange: { start: params.start, end: params.end },
      ...(params.dimensions && { dimensions: params.dimensions }),
      filters: viewFilters,
      hasUnsavedChanges: false,
    });
    if (params.visibleColumns) {
      useOnPageColumnStore.getState().setVisibleColumns(params.visibleColumns);
    }
    if (params.sortBy) {
      store.setSort(params.sortBy, params.sortDir ?? 'descend');
    } else {
      store.loadData();
    }
  }, []);

  useApplyViewFromUrl(handleApplyView);

  const getCurrentState = useCallback(() => {
    const { dateRange, dimensions, filters: storeFilters, sortColumn, sortDirection } = useOnPageStore.getState();
    const { visibleColumns } = useOnPageColumnStore.getState();
    const activeFilters = storeFilters
      .filter((f) => f.field && f.value)
      .map(({ field, operator, value }) => ({ field, operator, value }));
    return {
      dateRange, dimensions, sortBy: sortColumn, sortDir: sortDirection,
      visibleColumns, totalColumns: ON_PAGE_METRIC_COLUMNS.length,
      ...(activeFilters.length > 0 && { filters: activeFilters }),
    };
  }, []);

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
        icon={<LinkOutlined />}
        onClick={() => setUrlClassificationOpen(true)}
        size="small"
      >
        URL Paths
        {unclassifiedCount != null && unclassifiedCount > 0 && (
          <span style={{
            marginLeft: 4,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 9,
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1,
            color: '#fff',
            background: 'var(--color-error)',
          }}>
            {unclassifiedCount}
          </span>
        )}
      </Button>
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
          <OnPageFilterToolbar filters={filters} onFiltersChange={setFilters} />
          <TableInfoBanner messages={[
            ...(includesToday ? ["Today's data may be incomplete"] : []),
            'Rows with 1 or fewer page views are hidden',
          ]} />
          <OnPageDataTable />
        </div>
      </div>
      <OnPageColumnSettingsModal
        open={columnSettingsOpen}
        onClose={() => setColumnSettingsOpen(false)}
      />
      <UrlClassificationModal
        open={urlClassificationOpen}
        onClose={() => setUrlClassificationOpen(false)}
        onCountChange={setUnclassifiedCount}
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
