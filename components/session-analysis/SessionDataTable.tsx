'use client';

import { GenericDataTable } from '@/components/table/GenericDataTable';
import { useSessionStore } from '@/stores/sessionStore';
import { useSessionColumnStore } from '@/stores/sessionColumnStore';
import { SESSION_METRIC_COLUMNS } from '@/config/sessionColumns';
import type { SessionReportRow } from '@/types/sessionReport';
import type { ColumnGroup } from '@/types/table';
import themeStyles from '@/styles/tables/themes/session.module.css';

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
 * Session Analytics Data Table Component
 * Displays hierarchical session data with composable dimensions
 * including Funnel Steps for page-level drill-down
 */
export function SessionDataTable() {
  return (
    <GenericDataTable<SessionReportRow>
      useStore={useSessionStore}
      useColumnStore={useSessionColumnStore}
      metricColumns={SESSION_METRIC_COLUMNS}
      columnGroups={COLUMN_GROUPS}
      colorClassName={themeStyles.theme}
      showColumnTooltips={true}
    />
  );
}
