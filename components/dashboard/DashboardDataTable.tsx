'use client';

import { useState } from 'react';
import { GenericDataTable } from '@/components/table/GenericDataTable';
import { CustomerSubscriptionDetailModal } from '@/components/modals/CustomerSubscriptionDetailModal';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useDashboardColumnStore } from '@/stores/dashboardColumnStore';
import { DASHBOARD_METRIC_COLUMNS, DASHBOARD_COLUMN_GROUPS } from '@/config/dashboardColumns';
import type { DashboardRow } from '@/types/dashboard';
import type { MetricClickContext } from '@/types/dashboardDetails';
import type { ColumnGroup } from '@/types/table';
import themeStyles from '@/styles/tables/themes/dashboard.module.css';

const COLUMN_GROUPS: ColumnGroup[] = DASHBOARD_COLUMN_GROUPS;

export function DashboardDataTable() {
  const [modalContext, setModalContext] = useState<MetricClickContext | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleMetricClick = (context: MetricClickContext) => {
    setModalContext(context);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    // Keep context briefly for animation
    setTimeout(() => setModalContext(null), 300);
  };

  return (
    <>
      <GenericDataTable<DashboardRow>
        useStore={useDashboardStore}
        useColumnStore={useDashboardColumnStore}
        metricColumns={DASHBOARD_METRIC_COLUMNS}
        columnGroups={COLUMN_GROUPS}
        colorClassName={themeStyles.theme}
        showColumnTooltips={true}
        onMetricClick={handleMetricClick}
        hideZeroValues={true}
      />

      <CustomerSubscriptionDetailModal
        open={modalOpen}
        onClose={handleModalClose}
        context={modalContext}
      />
    </>
  );
}
