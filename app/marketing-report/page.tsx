'use client';

import { useState, Suspense, useEffect, useRef, useMemo, useCallback, lazy } from 'react';
import { Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { FilterPanel } from '@/components/filters/FilterPanel';
import { DataTable } from '@/components/table/DataTable';
import { SavedViewsDropdown } from '@/components/saved-views/SavedViewsDropdown';
import { useUrlSync } from '@/hooks/useUrlSync';
import { useSidebar } from '@/components/ui/sidebar';
import { useReportStore } from '@/stores/reportStore';
import { DIMENSION_GROUPS } from '@/config/dimensions';
import { BarChart3 } from 'lucide-react';
import { TableInfoBanner } from '@/components/ui/TableInfoBanner';
import pageStyles from '@/components/dashboard/dashboard.module.css';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import type { ResolvedViewParams } from '@/types/savedViews';
import type { TableFilter } from '@/types/filters';

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
  const { setOpen } = useSidebar();
  const hasCollapsed = useRef(false);
  const { hasUnsavedChanges, resetFilters, dateRange, filters, setFilters } = useReportStore();

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

  const handleApplyView = useCallback((params: ResolvedViewParams) => {
    const store = useReportStore.getState();
    const viewFilters = params.filters
      ? params.filters.map((f, i) => ({
          id: `view-${i}-${Date.now()}`,
          field: f.field,
          operator: f.operator as TableFilter['operator'],
          value: f.value,
        }))
      : [];
    useReportStore.setState({
      dateRange: { start: params.start, end: params.end },
      ...(params.dimensions && { dimensions: params.dimensions }),
      filters: viewFilters,
      hasUnsavedChanges: false,
    });
    if (params.sortBy) {
      store.setSort(params.sortBy, params.sortDir ?? 'descend');
    } else {
      store.loadData();
    }
  }, []);

  const getCurrentState = useCallback(() => {
    const { dateRange, dimensions, filters: storeFilters, sortColumn, sortDirection } = useReportStore.getState();
    const activeFilters = storeFilters
      .filter((f) => f.field && f.value)
      .map(({ field, operator, value }) => ({ field, operator, value }));
    return {
      dateRange, dimensions, sortBy: sortColumn, sortDir: sortDirection,
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
          <FilterToolbar />
          <FilterPanel
            filters={filters}
            onFiltersChange={setFilters}
            dimensionGroups={DIMENSION_GROUPS}
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
