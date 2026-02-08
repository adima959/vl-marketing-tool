import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import type { MetricColumn } from './metrics';
import type { MetricClickContext } from './dashboardDetails';
import type { MarketingMetricClickContext } from './marketingDetails';
import type { OnPageViewClickContext } from './onPageDetails';

/**
 * Base row interface that all table data must extend
 */
export interface BaseTableRow {
  key: string;
  attribute: string;
  depth: number;
  hasChildren?: boolean;
  children?: BaseTableRow[];
  metrics: Record<string, number | null>;
}

/**
 * Column group configuration
 */
export interface ColumnGroup {
  title: string;
  metricIds: string[];
}

/**
 * Store interface that tables expect
 */
export interface TableStore<TRow extends BaseTableRow> {
  reportData: TRow[];
  loadedDimensions: string[];
  loadedDateRange: { start: Date; end: Date };
  expandedRowKeys: string[];
  setExpandedRowKeys: (keys: string[]) => void;
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  isLoading: boolean;
  isLoadingSubLevels?: boolean;
  hasLoadedOnce: boolean;
  loadChildData: (key: string, value: string, depth: number) => Promise<void>;
  loadData: () => Promise<void>;
  error: string | null;
}

/**
 * Column store interface that tables expect
 */
export interface ColumnStore {
  visibleColumns: string[];
}

/**
 * Generic metric click context for use across different table types
 */
export type GenericMetricClickContext = MetricClickContext | MarketingMetricClickContext;

/**
 * Configuration for GenericDataTable
 */
export interface GenericDataTableConfig<TRow extends BaseTableRow> {
  /** Hook to access the table store */
  useStore: () => TableStore<TRow>;

  /** Hook to access the column visibility store */
  useColumnStore: () => ColumnStore;

  /** All available metric columns */
  metricColumns: MetricColumn[];

  /** Column group definitions */
  columnGroups: ColumnGroup[];

  /** CSS class name for color theming */
  colorClassName: string;

  /** Whether to show tooltips on column headers */
  showColumnTooltips?: boolean;

  /** Optional callback when a metric cell is clicked (for detail modals) - Dashboard context */
  onMetricClick?: (context: MetricClickContext) => void;

  /** Optional callback when a marketing metric cell is clicked (for detail modals) - Marketing context */
  onMarketingMetricClick?: (context: MarketingMetricClickContext) => void;

  /** IDs of metrics that should be clickable for marketing details (e.g., ['crmSubscriptions', 'approvedSales']) */
  clickableMarketingMetrics?: string[];

  /** Optional callback when a metric cell is clicked in On-Page Analysis */
  onOnPageMetricClick?: (context: OnPageViewClickContext) => void;

  /** IDs of metrics that should be clickable for on-page details (e.g., ['pageViews']) */
  clickableOnPageMetrics?: string[];

  /** Whether to hide cells with zero values */
  hideZeroValues?: boolean;
}
