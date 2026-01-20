'use client';

import { useState, Suspense } from 'react';
import { ReportLayout } from '@/components/layout/ReportLayout';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { DataTable } from '@/components/table/DataTable';
import { TableFooter } from '@/components/table/TableFooter';
import { ColumnSettingsModal } from '@/components/modals/ColumnSettingsModal';
import { useUrlSync } from '@/hooks/useUrlSync';

function DashboardContent() {
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  // Sync store state with URL parameters
  useUrlSync();

  return (
    <ReportLayout>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 16,
          padding: 16,
        }}
      >
        <FilterToolbar />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <DataTable />
        </div>
        <TableFooter onColumnSettings={() => setColumnSettingsOpen(true)} />
      </div>
      <ColumnSettingsModal
        open={columnSettingsOpen}
        onClose={() => setColumnSettingsOpen(false)}
      />
    </ReportLayout>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
