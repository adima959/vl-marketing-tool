import { Table, Tooltip } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { useMemo, useRef } from 'react';
import { MetricCell } from './MetricCell';
import { ClickableMetricCell } from '@/components/dashboard/ClickableMetricCell';
import { MarketingClickableMetricCell } from './MarketingClickableMetricCell';
import { DASHBOARD_DETAIL_METRIC_IDS, type DashboardDetailMetricId, type MarketingDetailMetricId } from '@/lib/server/crmMetrics';
import { OnPageClickableMetricCell } from '@/components/on-page-analysis/OnPageClickableMetricCell';
import { useToast } from '@/hooks/useToast';
import { useDragScroll } from '@/hooks/useDragScroll';
import { ErrorMessage } from '@/components/ErrorMessage';
import { EmptyState } from '@/components/EmptyState';
import { TableSkeleton } from '@/components/loading/TableSkeleton';
import type { BaseTableRow, GenericDataTableConfig } from '@/types/table';
import styles from '@/styles/tables/base.module.css';

export function GenericDataTable<TRow extends BaseTableRow>({
  useStore,
  useColumnStore,
  metricColumns,
  columnGroups,
  colorClassName,
  showColumnTooltips = false,
  onMetricClick,
  onMarketingMetricClick,
  clickableMarketingMetrics = [],
  onOnPageMetricClick,
  clickableOnPageMetrics = [],
  hideZeroValues = false,
}: GenericDataTableConfig<TRow>) {
  const {
    reportData,
    loadedDimensions,
    loadedDateRange,
    expandedRowKeys,
    setExpandedRowKeys,
    sortColumn,
    sortDirection,
    setSort,
    isLoading,
    isLoadingSubLevels,
    hasLoadedOnce,
    loadChildData,
    loadData,
    error,
  } = useStore();
  const { visibleColumns } = useColumnStore();
  const toast = useToast();

  // Calculate total table width for scroll.x (sum of all column widths)
  const tableWidth = useMemo(() => {
    const attributeWidth = 350;
    const visibleMetricsWidth = metricColumns
      .filter((col) => visibleColumns.includes(col.id))
      .reduce((sum, col) => sum + col.width, 0);
    return attributeWidth + visibleMetricsWidth;
  }, [metricColumns, visibleColumns]);

  // Process data to inject skeleton rows for expanded parents that are loading
  const processedData = useMemo(() => {
    if (!isLoadingSubLevels) return reportData;

    const injectSkeletons = (rows: TRow[]): TRow[] => {
      return rows.map((row) => {
        const isExpanded = expandedRowKeys.includes(row.key);
        const needsSkeleton = isExpanded && row.hasChildren && (!row.children || row.children.length === 0);

        if (needsSkeleton) {
          // Create 2 skeleton placeholder children
          const skeletonChildren = [1, 2].map((i) => ({
            key: `${row.key}::skeleton-${i}`,
            attribute: '',
            depth: row.depth + 1,
            hasChildren: false,
            metrics: {},
            _isSkeleton: true,
          })) as unknown as TRow[];
          return { ...row, children: skeletonChildren };
        }

        // Recursively process children
        if (row.children && row.children.length > 0) {
          return { ...row, children: injectSkeletons(row.children as TRow[]) };
        }

        return row;
      });
    };

    return injectSkeletons(reportData);
  }, [reportData, expandedRowKeys, isLoadingSubLevels]);

  // Build columns from config
  const columns: ColumnsType<TRow> = useMemo(() => {
    // First column: Attributes (always visible) - no grouping, so it spans both header rows
    const attributeColumn: ColumnsType<TRow>[0] = {
      title: 'Attributes',
      dataIndex: 'attribute',
      key: 'attribute',
      fixed: 'left',
      width: 350,
      onHeaderCell: () => ({
        rowSpan: 2,
      }),
      render: (value: string, record: TRow) => {
        const indent = record.depth * 20; // 20px per level
        const isExpanded = expandedRowKeys.includes(record.key);
        const isSkeleton = (record as TRow & { _isSkeleton?: boolean })._isSkeleton;

        // Render skeleton row
        if (isSkeleton) {
          return (
            <div className={styles.attributeCell} style={{ paddingLeft: `${indent}px` }}>
              <span className={styles.expandSpacer} />
              <div className={styles.skeletonText} />
            </div>
          );
        }

        // Format date values to dd/MM/yyyy
        const formatAttributeValue = (val: string): string => {
          // Check if value looks like an ISO date string
          if (val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
            const date = new Date(val);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
          }
          return val;
        };

        return (
          <div
            className={styles.attributeCell}
            style={{ paddingLeft: `${indent}px` }}
          >
            {record.hasChildren ? (
              <span
                className={styles.expandIcon}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (isExpanded) {
                    setExpandedRowKeys(expandedRowKeys.filter((k) => k !== record.key));
                  } else {
                    if (!expandedRowKeys.includes(record.key)) {
                      setExpandedRowKeys([...expandedRowKeys, record.key]);
                    }
                    if (!record.children || record.children.length === 0) {
                      try {
                        await loadChildData(record.key, record.attribute, record.depth);
                      } catch (error) {
                        // Revert expansion on error
                        setExpandedRowKeys(expandedRowKeys.filter((k) => k !== record.key));
                        toast.error('Failed to load child data. Please try again.');
                      }
                    }
                  }
                }}
              >
                {isExpanded ? '▼' : '▶'}
              </span>
            ) : (
              <span className={styles.expandSpacer} />
            )}
            <Tooltip title={formatAttributeValue(value)} placement="topLeft" mouseEnterDelay={0.5}>
              <span
                className={`${styles.attributeText} ${
                  record.depth === 0 ? styles.attributeTextBold : ''
                }`}
              >
                {formatAttributeValue(value)}
              </span>
            </Tooltip>
          </div>
        );
      },
    };

    // Get visible metric columns
    const visibleMetrics = metricColumns.filter((col) => visibleColumns.includes(col.id));

    // Create grouped columns
    const groupedColumns: ColumnsType<TRow> = [];

    for (const group of columnGroups) {
      const groupMetrics = visibleMetrics
        .filter((col) => group.metricIds.includes(col.id))
        .map((col) => ({
          title: (
            <Tooltip title={col.description || col.label} placement="top">
              <span style={{ cursor: 'default' }}>{col.shortLabel}</span>
            </Tooltip>
          ),
          dataIndex: ['metrics', col.id],
          key: col.id,
          width: col.width,
          align: 'center' as const,
          sorter: true,
          sortOrder: sortColumn === col.id ? sortDirection : null,
          showSorterTooltip: false,
          render: (value: number | null, record: TRow) => {
            // Render skeleton for loading rows
            const isSkeleton = (record as TRow & { _isSkeleton?: boolean })._isSkeleton;
            if (isSkeleton) {
              return <div className={styles.skeletonMetric} />;
            }

            // Null means no data available (e.g., CRM for non-matchable dimensions)
            if (value === null || value === undefined) {
              return <span style={{ color: 'var(--color-gray-300)' }}>–</span>;
            }

            // Check if this is a marketing clickable metric
            if (onMarketingMetricClick && loadedDateRange && clickableMarketingMetrics.includes(col.id)) {
              return (
                <MarketingClickableMetricCell
                  value={value ?? 0}
                  format={col.format}
                  metricId={col.id as MarketingDetailMetricId}
                  metricLabel={col.label}
                  rowKey={record.key}
                  depth={record.depth}
                  dimensions={loadedDimensions}
                  dateRange={loadedDateRange}
                  onClick={onMarketingMetricClick}
                  hideZero={hideZeroValues}
                />
              );
            }
            // Check if this is an on-page clickable metric
            if (onOnPageMetricClick && loadedDateRange && clickableOnPageMetrics.includes(col.id)) {
              return (
                <OnPageClickableMetricCell
                  value={value ?? 0}
                  format={col.format}
                  metricId={col.id}
                  metricLabel={col.label}
                  rowKey={record.key}
                  depth={record.depth}
                  dimensions={loadedDimensions}
                  dateRange={loadedDateRange}
                  onClick={onOnPageMetricClick}
                />
              );
            }
            // Conditionally use ClickableMetricCell when onMetricClick is provided (for Dashboard)
            const clickableMetricIds: readonly string[] = DASHBOARD_DETAIL_METRIC_IDS;
            if (onMetricClick && loadedDateRange && clickableMetricIds.includes(col.id)) {
              return (
                <ClickableMetricCell
                  value={value ?? 0}
                  format={col.format}
                  metricId={col.id as DashboardDetailMetricId}
                  metricLabel={col.label}
                  rowKey={record.key}
                  depth={record.depth}
                  dimensions={loadedDimensions}
                  dateRange={loadedDateRange}
                  onClick={onMetricClick}
                  hideZero={hideZeroValues}
                />
              );
            }
            // Default non-clickable cell
            return <MetricCell value={value ?? 0} format={col.format} hideZero={hideZeroValues} />;
          },
        }));

      if (groupMetrics.length > 0) {
        groupedColumns.push({
          title: group.title,
          children: groupMetrics,
        });
      }
    }

      return [attributeColumn, ...groupedColumns];
  }, [
    visibleColumns,
    sortColumn,
    sortDirection,
    expandedRowKeys,
    setExpandedRowKeys,
    loadChildData,
    metricColumns,
    columnGroups,
    showColumnTooltips,
    onMetricClick,
    onMarketingMetricClick,
    clickableMarketingMetrics,
    onOnPageMetricClick,
    clickableOnPageMetrics,
    loadedDimensions,
    loadedDateRange,
    toast,
    hideZeroValues,
  ]);

  // Handle sort change
  const handleTableChange: TableProps<TRow>['onChange'] = (
    _pagination,
    _filters,
    sorter
  ) => {
    if (!Array.isArray(sorter)) {
      setSort(
        sorter.columnKey as string ?? null,
        sorter.order ?? null
      );
    }
  };

  // Handle row expansion with lazy loading
  const handleExpand = async (expanded: boolean, record: TRow) => {
    if (expanded) {
      if (!expandedRowKeys.includes(record.key)) {
        setExpandedRowKeys([...expandedRowKeys, record.key]);
      }

      // Lazy load children if they haven't been loaded yet
      if ((!record.children || record.children.length === 0) && record.hasChildren) {
        await loadChildData(record.key, record.attribute, record.depth);
      }
    } else {
      setExpandedRowKeys(expandedRowKeys.filter((k) => k !== record.key));
    }
  };

  // Ref for table container
  const tableRef = useRef<HTMLDivElement>(null);

  // Drag-to-scroll + header/body scroll sync
  useDragScroll(tableRef);

  // Show error state
  if (error) {
    return <ErrorMessage error={error} onRetry={loadData} />;
  }

  // Show loading skeleton when loading and no data
  if (isLoading && reportData.length === 0) {
    return <TableSkeleton rows={10} columns={visibleColumns.length + 1} />;
  }

  // Show initial prompt if data has never been loaded
  if (!hasLoadedOnce && !isLoading && reportData.length === 0) {
    return (
      <div className={styles.initialPrompt}>
        <h3 className={styles.promptTitle}>Ready to analyze your data?</h3>
        <p className={styles.promptText}>
          Select your dimensions and date range above, then click "Load Data" to get started.
        </p>
      </div>
    );
  }

  // Show empty state when data has been loaded but no results found
  if (hasLoadedOnce && !isLoading && reportData.length === 0) {
    return <EmptyState />;
  }

  return (
    <div ref={tableRef} className={`${styles.dataTable} ${colorClassName}`}>
      <Table<TRow>
        columns={columns}
        dataSource={processedData}
        loading={isLoading && reportData.length > 0}
        pagination={false}
        size="middle"
        scroll={{ x: tableWidth }}
        sticky={{ offsetHeader: 0 }}
        rowKey="key"
        expandable={{
          expandedRowKeys,
          childrenColumnName: 'children',
          indentSize: 0,
          expandIcon: () => null,
        }}
        onChange={handleTableChange}
      />
    </div>
  );
}
