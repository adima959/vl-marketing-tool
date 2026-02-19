'use client';

import { useCallback, useState } from 'react';
import { GenericDataTable } from '@/components/table/GenericDataTable';
import { useDashboardStore } from '@/stores/dashboardStore';
import { DASHBOARD_METRIC_COLUMNS, DASHBOARD_COLUMN_GROUPS } from '@/config/dashboardColumns';
import { CLICKABLE_METRIC_IDS } from '@/lib/utils/saleRowFilters';
import { SaleDetailModal } from '@/components/dashboard/SaleDetailModal';
import type { DashboardRow } from '@/types/sales';
import type { MetricClickContext } from '@/types/table';
import styles from './dashboard.module.css';

/** All dashboard columns are always visible — no column settings UI */
const ALL_COLUMN_IDS = DASHBOARD_METRIC_COLUMNS.map((col) => col.id);
const useAllColumns = () => ({ visibleColumns: ALL_COLUMN_IDS });

export function DashboardDataTable() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<MetricClickContext | null>(null);

  const handleMetricClick = useCallback((context: MetricClickContext) => {
    setModalContext(context);
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <>
      <GenericDataTable<DashboardRow>
        useStore={useDashboardStore}
        useColumnStore={useAllColumns}
        metricColumns={DASHBOARD_METRIC_COLUMNS}
        columnGroups={DASHBOARD_COLUMN_GROUPS}
        colorClassName={styles.tableTheme}
        hideZeroValues
        onMetricClick={handleMetricClick}
        clickableMetrics={CLICKABLE_METRIC_IDS}
      />
      <SaleDetailModal
        open={modalOpen}
        onClose={handleModalClose}
        context={modalContext}
      />
    </>
  );
}
