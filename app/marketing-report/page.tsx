'use client';

import { useState, Suspense, useEffect, useRef, useMemo, lazy } from 'react';
import { Button } from 'antd';
import { SettingOutlined, WarningOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { DataTable } from '@/components/table/DataTable';
import { useUrlSync } from '@/hooks/useUrlSync';
import { useSidebar } from '@/components/ui/sidebar';
import { useReportStore } from '@/stores/reportStore';
import { BarChart3 } from 'lucide-react';

const ColumnSettingsModal = lazy(() =>
  import('@/components/modals/ColumnSettingsModal').then((mod) => ({ default: mod.ColumnSettingsModal }))
);

function MarketingReportContent() {
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const { setOpen } = useSidebar();
  const hasCollapsed = useRef(false);
  const { hasUnsavedChanges, resetFilters, dateRange } = useReportStore();

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

  const headerWarning = includesToday ? (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 12px',
      background: '#fffbeb',
      border: '1px solid #fef3c7',
      borderRadius: '6px',
      fontSize: '13px',
      color: '#92400e'
    }}>
      <WarningOutlined style={{ fontSize: '14px', color: '#f59e0b' }} />
      <span style={{ fontWeight: 500 }}>Today's data may be incomplete</span>
    </div>
  ) : null;

  return (
    <>
      <PageHeader
        title="Marketing Report"
        icon={<BarChart3 className="h-5 w-5" />}
        actions={headerActions}
        warning={headerWarning}
      />
      <div className="flex flex-col h-full">
        <div className="flex flex-col gap-3 p-3 bg-white flex-1 overflow-auto">
          <FilterToolbar />
          <DataTable />
        </div>
        {columnSettingsOpen && (
          <Suspense fallback={null}>
            <ColumnSettingsModal
              open={columnSettingsOpen}
              onClose={() => setColumnSettingsOpen(false)}
            />
          </Suspense>
        )}
      </div>
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
