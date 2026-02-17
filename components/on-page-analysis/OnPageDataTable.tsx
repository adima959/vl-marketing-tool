'use client';

import { useState } from 'react';
import { GenericDataTable } from '@/components/table/GenericDataTable';
import { useOnPageStore } from '@/stores/onPageStore';
import { useOnPageColumnStore } from '@/stores/onPageColumnStore';
import { ON_PAGE_METRIC_COLUMNS } from '@/config/onPageColumns';
import { OnPageViewsModal } from './OnPageViewsModal';
import type { OnPageReportRow } from '@/types/onPageReport';
import type { ColumnGroup } from '@/types/table';
import type { OnPageViewClickContext } from '@/types/onPageDetails';
import themeStyles from '@/styles/tables/themes/onPage.module.css';

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

const CLICKABLE_METRICS = ['pageViews', 'uniqueVisitors', 'scrollPastHero', 'formViews', 'formStarters'];

/**
 * On-Page Analysis Data Table Component
 * Displays hierarchical visitor behavior data with expand/collapse functionality
 */
export function OnPageDataTable() {
  const [viewsModalContext, setViewsModalContext] = useState<OnPageViewClickContext | null>(null);
  const [viewsModalOpen, setViewsModalOpen] = useState(false);

  const handleMetricClick = (context: OnPageViewClickContext) => {
    setViewsModalContext(context);
    setViewsModalOpen(true);
  };

  return (
    <>
      <GenericDataTable<OnPageReportRow>
        useStore={useOnPageStore}
        useColumnStore={useOnPageColumnStore}
        metricColumns={ON_PAGE_METRIC_COLUMNS}
        columnGroups={COLUMN_GROUPS}
        colorClassName={themeStyles.theme}
        showColumnTooltips={true}
        onOnPageMetricClick={handleMetricClick}
        clickableOnPageMetrics={CLICKABLE_METRICS}
      />
      <OnPageViewsModal
        open={viewsModalOpen}
        onClose={() => { setViewsModalOpen(false); setViewsModalContext(null); }}
        context={viewsModalContext}
      />
    </>
  );
}
