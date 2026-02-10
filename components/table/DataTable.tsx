import { GenericDataTable } from './GenericDataTable';
import { useReportStore } from '@/stores/reportStore';
import { useColumnStore } from '@/stores/columnStore';
import { METRIC_COLUMNS, MARKETING_METRIC_IDS, CRM_METRIC_IDS } from '@/config/columns';
import type { ReportRow } from '@/types';
import type { ColumnGroup } from '@/types/table';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import { MARKETING_DETAIL_METRIC_IDS } from '@/lib/server/crmMetrics';
import themeStyles from '@/styles/tables/themes/marketing.module.css';

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

// Define which CRM metrics are clickable (show detail modal on click)
const CLICKABLE_MARKETING_METRICS = [...MARKETING_DETAIL_METRIC_IDS];

interface DataTableProps {
  /** Optional callback when a CRM metric cell is clicked (for detail modals) */
  onMarketingMetricClick?: (context: MarketingMetricClickContext) => void;
}

/**
 * Marketing Report Data Table Component
 * Displays hierarchical marketing campaign data with expand/collapse functionality
 */
export function DataTable({ onMarketingMetricClick }: DataTableProps) {
  return (
    <GenericDataTable<ReportRow>
      useStore={useReportStore}
      useColumnStore={useColumnStore}
      metricColumns={METRIC_COLUMNS}
      columnGroups={COLUMN_GROUPS}
      colorClassName={themeStyles.theme}
      showColumnTooltips={false}
      hideZeroValues={true}
      onMarketingMetricClick={onMarketingMetricClick}
      clickableMarketingMetrics={onMarketingMetricClick ? CLICKABLE_MARKETING_METRICS : []}
    />
  );
}
