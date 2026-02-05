'use client';

import { useState, Suspense, useEffect, useRef, useMemo } from 'react';
import { Button } from 'antd';
import { SettingOutlined, WarningOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { OnPageFilterToolbar } from '@/components/on-page-analysis/OnPageFilterToolbar';
import { OnPageDataTable } from '@/components/on-page-analysis/OnPageDataTable';
import { OnPageColumnSettingsModal } from '@/components/on-page-analysis/OnPageColumnSettingsModal';
import { useOnPageUrlSync } from '@/hooks/useOnPageUrlSync';
import { useSidebar } from '@/components/ui/sidebar';
import { useOnPageStore } from '@/stores/onPageStore';
import { Eye } from 'lucide-react';
import pageStyles from '@/components/dashboard/dashboard.module.css';

function OnPageAnalysisContent() {
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const { setOpen } = useSidebar();
  const hasCollapsed = useRef(false);
  const { hasUnsavedChanges, resetFilters, dateRange } = useOnPageStore();

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
      <span style={{ fontWeight: 500 }}>Today&apos;s data may be incomplete</span>
    </div>
  ) : null;

  return (
    <>
      <div className={pageStyles.page}>
        <PageHeader
          title="On-Page Analysis"
          icon={<Eye className="h-5 w-5" />}
          actions={headerActions}
          warning={headerWarning}
        />
        <div className={pageStyles.content}>
          <OnPageFilterToolbar />
          <OnPageDataTable />
        </div>
      </div>
      <OnPageColumnSettingsModal
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
