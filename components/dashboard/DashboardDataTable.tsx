'use client';

import { GenericDataTable } from '@/components/table/GenericDataTable';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useDashboardColumnStore } from '@/stores/dashboardColumnStore';
import { DASHBOARD_METRIC_COLUMNS, DASHBOARD_COLUMN_GROUPS } from '@/config/dashboardColumns';
import type { DashboardRow } from '@/types/dashboard';
import type { ColumnGroup } from '@/types/table';
import styles from './DashboardDataTable.module.css';

const COLUMN_GROUPS: ColumnGroup[] = DASHBOARD_COLUMN_GROUPS;

export function DashboardDataTable() {
  return (
    <GenericDataTable<DashboardRow>
      useStore={useDashboardStore}
      useColumnStore={useDashboardColumnStore}
      metricColumns={DASHBOARD_METRIC_COLUMNS}
      columnGroups={COLUMN_GROUPS}
      colorClassName={styles.dashboardColors}
      showColumnTooltips={true}
    />
  );
}
