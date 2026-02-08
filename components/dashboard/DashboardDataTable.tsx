'use client';

import { useState } from 'react';
import { GenericDataTable } from '@/components/table/GenericDataTable';
import { CrmDetailModal } from '@/components/modals/CrmDetailModal';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useDashboardColumnStore } from '@/stores/dashboardColumnStore';
import { DASHBOARD_METRIC_COLUMNS, DASHBOARD_COLUMN_GROUPS } from '@/config/dashboardColumns';
import type { DashboardRow } from '@/types/dashboard';
import type { MetricClickContext } from '@/types/dashboardDetails';
import type { ColumnGroup } from '@/types/table';
import styles from './dashboard.module.css';

const COLUMN_GROUPS: ColumnGroup[] = DASHBOARD_COLUMN_GROUPS;

export function DashboardDataTable() {
  const [modalContext, setModalContext] = useState<MetricClickContext | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleMetricClick = (context: MetricClickContext) => {
    // Dashboard aggregate always excludes upsell-tagged invoices from trials,
    // so detail query must match by setting excludeUpsellTags
    context.filters.excludeUpsellTags = true;
    setModalContext(context);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setTimeout(() => setModalContext(null), 300);
  };

  return (
    <div className={styles.tableSection}>
      <GenericDataTable<DashboardRow>
        useStore={useDashboardStore}
        useColumnStore={useDashboardColumnStore}
        metricColumns={DASHBOARD_METRIC_COLUMNS}
        columnGroups={COLUMN_GROUPS}
        colorClassName={styles.tableTheme}
        showColumnTooltips={true}
        onMetricClick={handleMetricClick}
        hideZeroValues={true}
      />

      <CrmDetailModal
        open={modalOpen}
        onClose={handleModalClose}
        variant="dashboard"
        context={modalContext}
      />
    </div>
  );
}
