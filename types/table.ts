import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import type { MetricColumn } from './metrics';
import type { OnPageViewClickContext } from './onPageDetails';

/**
 * Generic metric click context — used by dashboard detail modal.
 * Dimension filters are extracted from the row key at click time.
 */
export interface MetricClickContext {
  metricId: string;
  metricLabel: string;
  value: number;
  filters: {
    dateRange: { start: Date; end: Date };
    dimensionFilters: Record<string, string>;
  };
}

/**
 * Base row interface that all table data must extend
 */
export interface BaseTableRow {
  key: string;
  attribute: string;
  depth: number;
  hasChildren?: boolean;
  children?: BaseTableRow[];
  metrics: Record<string, number | string | null>;
}

/**
 * Column group configuration
 */
export interface ColumnGroup {
  title: string;
  metricIds: string[];
  /** CSS class applied to each metric cell (th + td) in this group */
  cellClassName?: string;
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
}

/**
 * Column store interface that tables expect
 */
export interface ColumnStore {
  visibleColumns: string[];
}

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

  /** Optional callback when a metric cell is clicked in On-Page Analysis */
  onOnPageMetricClick?: (context: OnPageViewClickContext) => void;

  /** IDs of metrics that should be clickable for on-page details (e.g., ['pageViews']) */
  clickableOnPageMetrics?: string[];

  /** Generic metric click handler (used by dashboard) */
  onMetricClick?: (context: MetricClickContext) => void;

  /** IDs of metrics that should be clickable (used by dashboard) */
  clickableMetrics?: string[];

  /** Whether to hide cells with zero values */
  hideZeroValues?: boolean;

  /** Optional function returning a URL for the attribute action button (shows on hover).
   *  Return null to hide the button for that row. */
  getAttributeActionUrl?: (record: TRow) => string | null;

  /** Optional function returning a warning badge for an attribute cell.
   *  Return null to hide the badge for that row. */
  getAttributeWarning?: (record: TRow) => { tooltip: string; href: string } | null;

}
