import { GenericDataTable } from './GenericDataTable';
import { useReportStore } from '@/stores/reportStore';
import { useColumnStore } from '@/stores/columnStore';
import { METRIC_COLUMNS, MARKETING_METRIC_IDS, CRM_METRIC_IDS } from '@/config/columns';
import type { ReportRow } from '@/types';
import type { ColumnGroup } from '@/types/table';
import styles from './DataTable.module.css';

// Define column groups for marketing report
const COLUMN_GROUPS: ColumnGroup[] = [
  {
    title: 'Marketing Data',
    metricIds: [...MARKETING_METRIC_IDS],
  },
  {
    title: 'CRM Data',
    metricIds: [...CRM_METRIC_IDS],
  },
];

/**
 * Marketing Report Data Table Component
 * Displays hierarchical marketing campaign data with expand/collapse functionality
 */
export function DataTable() {
  return (
    <GenericDataTable<ReportRow>
      useStore={useReportStore}
      useColumnStore={useColumnStore}
      metricColumns={METRIC_COLUMNS}
      columnGroups={COLUMN_GROUPS}
      colorClassName={styles.marketingColors}
      showColumnTooltips={false}
    />
  );
}
