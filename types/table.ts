import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import type { MetricColumn } from './metrics';

/**
 * Base row interface that all table data must extend
 */
export interface BaseTableRow {
  key: string;
  attribute: string;
  depth: number;
  hasChildren?: boolean;
  children?: BaseTableRow[];
  metrics: Record<string, number>;
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
  expandedRowKeys: string[];
  setExpandedRowKeys: (keys: string[]) => void;
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  isLoading: boolean;
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
}
