import { useCallback, useState } from 'react';
import { GenericDataTable } from './GenericDataTable';
import { useReportStore } from '@/stores/reportStore';
import { useColumnStore } from '@/stores/columnStore';
import { METRIC_COLUMNS, MARKETING_METRIC_IDS, CRM_METRIC_IDS } from '@/config/columns';
import { CLICKABLE_METRIC_IDS } from '@/lib/utils/saleRowFilters';
import { SaleDetailModal } from '@/components/dashboard/SaleDetailModal';
import { filterCrmForMarketingRow } from '@/lib/utils/marketingTree';
import { buildOnPageUrl } from '@/lib/utils/onPageLink';
import type { SaleRow } from '@/types/sales';
import type { ReportRow } from '@/types';
import type { ColumnGroup, MetricClickContext } from '@/types/table';
import themeStyles from '@/styles/tables/themes/marketing.module.css';

const COLUMN_GROUPS: ColumnGroup[] = [
  {
    title: 'Marketing Data',
    metricIds: [...MARKETING_METRIC_IDS],
  },
  {
    title: 'CRM Data',
    metricIds: [...CRM_METRIC_IDS],
    cellClassName: themeStyles.crmCell,
  },
];

/**
 * Marketing Report Data Table Component
 * Displays hierarchical marketing campaign data with expand/collapse functionality
 */
export function DataTable() {
  const { loadedDateRange, loadedDimensions } = useReportStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<MetricClickContext | null>(null);
  const [modalSales, setModalSales] = useState<SaleRow[]>([]);

  const handleMetricClick = useCallback((context: MetricClickContext) => {
    const { crmSales, flatData, loadedDimensions: dims } = useReportStore.getState();
    const filtered = filterCrmForMarketingRow(
      crmSales,
      context.filters.dimensionFilters,
      flatData,
      dims,
    );
    setModalSales(filtered);
    setModalContext(context);
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => setModalOpen(false), []);

  const getAttributeActionUrl = useCallback(
    (record: ReportRow): string | null => {
      if (!loadedDateRange) return null;
      return buildOnPageUrl({
        dateRange: loadedDateRange,
        dimensions: loadedDimensions,
        rowKey: record.key,
      });
    },
    [loadedDateRange, loadedDimensions]
  );

  const classificationDims = new Set(['classifiedProductOwner', 'classifiedProduct', 'classifiedCountry']);

  const getAttributeWarning = useCallback(
    (record: ReportRow): { tooltip: string; href: string } | null => {
      if (record.attribute !== 'Unassigned') return null;
      const dimId = loadedDimensions[record.depth];
      if (!dimId || !classificationDims.has(dimId)) return null;
      return {
        tooltip: 'Unclassified campaigns — click to open Campaign Map',
        href: '/settings/data-maps?tab=campaign',
      };
    },
    [loadedDimensions]
  );

  return (
    <>
      <GenericDataTable<ReportRow>
        useStore={useReportStore}
        useColumnStore={useColumnStore}
        metricColumns={METRIC_COLUMNS}
        columnGroups={COLUMN_GROUPS}
        colorClassName={themeStyles.theme}
        showColumnTooltips={false}
        hideZeroValues={true}
        getAttributeActionUrl={getAttributeActionUrl}
        getAttributeWarning={getAttributeWarning}
        onMetricClick={handleMetricClick}
        clickableMetrics={CLICKABLE_METRIC_IDS}
      />
      <SaleDetailModal
        open={modalOpen}
        onClose={handleModalClose}
        context={modalContext}
        salesData={modalSales}
      />
    </>
  );
}
