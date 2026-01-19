'use client';

import { useState } from 'react';
import { ReportLayout } from '@/components/layout/ReportLayout';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { DataTable } from '@/components/table/DataTable';
import { TableFooter } from '@/components/table/TableFooter';
import { ColumnSettingsModal } from '@/components/modals/ColumnSettingsModal';

export default function DashboardPage() {
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  return (
    <ReportLayout>
      <FilterToolbar />
      <DataTable />
      <TableFooter onColumnSettings={() => setColumnSettingsOpen(true)} />
      <ColumnSettingsModal
        open={columnSettingsOpen}
        onClose={() => setColumnSettingsOpen(false)}
      />
    </ReportLayout>
  );
}
