import { GenericDataTable } from '@/components/table/GenericDataTable';
import { useOnPageStore } from '@/stores/onPageStore';
import { useOnPageColumnStore } from '@/stores/onPageColumnStore';
import { ON_PAGE_METRIC_COLUMNS } from '@/config/onPageColumns';
import type { OnPageReportRow } from '@/types/onPageReport';
import type { ColumnGroup } from '@/types/table';
import colorStyles from './OnPageColors.module.css';

// Define column groups for on-page analysis
const COLUMN_GROUPS: ColumnGroup[] = [
  {
    title: 'Engagement',
    metricIds: ['pageViews', 'uniqueVisitors', 'bounceRate', 'avgActiveTime'],
  },
  {
    title: 'Interactions',
    metricIds: ['scrollPastHero', 'scrollRate', 'formViews', 'formViewRate', 'formStarters', 'formStartRate'],
  },
];

/**
 * On-Page Analysis Data Table Component
 * Displays hierarchical visitor behavior data with expand/collapse functionality
 */
export function OnPageDataTable() {
  return (
    <GenericDataTable<OnPageReportRow>
      useStore={useOnPageStore}
      useColumnStore={useOnPageColumnStore}
      metricColumns={ON_PAGE_METRIC_COLUMNS}
      columnGroups={COLUMN_GROUPS}
      colorClassName={colorStyles.onPageColors}
      showColumnTooltips={true}
    />
  );
}
