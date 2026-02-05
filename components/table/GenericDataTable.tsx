import { Table, Tooltip } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { useEffect, useMemo, useRef } from 'react';
import { MetricCell } from './MetricCell';
import { ClickableMetricCell } from '@/components/dashboard/ClickableMetricCell';
import { MarketingClickableMetricCell } from './MarketingClickableMetricCell';
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
                    setExpandedRowKeys([...expandedRowKeys, record.key]);
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
            <Tooltip title={col.label} placement="top">
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
          render: (value: number, record: TRow) => {
            // Render skeleton for loading rows
            const isSkeleton = (record as TRow & { _isSkeleton?: boolean })._isSkeleton;
            if (isSkeleton) {
              return <div className={styles.skeletonMetric} />;
            }

            // Check if this is a marketing clickable metric
            if (onMarketingMetricClick && loadedDateRange && clickableMarketingMetrics.includes(col.id)) {
              return (
                <MarketingClickableMetricCell
                  value={value ?? 0}
                  format={col.format}
                  metricId={col.id as 'crmSubscriptions' | 'approvedSales'}
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
            // Conditionally use ClickableMetricCell when onMetricClick is provided (for Dashboard)
            if (onMetricClick && loadedDateRange) {
              return (
                <ClickableMetricCell
                  value={value ?? 0}
                  format={col.format}
                  metricId={col.id as 'customers' | 'subscriptions' | 'trials' | 'trialsApproved' | 'upsells'}
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
      setExpandedRowKeys([...expandedRowKeys, record.key]);

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

  // DEBUG: Log ancestor overflow chain to find what traps sticky
  useEffect(() => {
    const header = tableRef.current?.querySelector('.ant-table-header') as HTMLElement;
    if (!header) { document.title = 'DEBUG: no .ant-table-header found'; return; }
    const ancestors: string[] = [];
    let el: HTMLElement | null = header;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const cls = el.className.replace(/\s+/g, '.').substring(0, 50);
        ancestors.push(`${el.tagName}.${cls}[ox:${s.overflowX},oy:${s.overflowY},pos:${s.position}]`);
      }
      el = el.parentElement;
    }
    document.title = `STICKY-DBG: header.pos=${getComputedStyle(header).position} | ancestors=${ancestors.join(' > ')}`;
  });

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
