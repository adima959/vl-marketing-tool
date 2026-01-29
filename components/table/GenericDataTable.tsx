import { Table, Tooltip } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { useMemo, useEffect, useRef } from 'react';
import { MetricCell } from './MetricCell';
import { useToast } from '@/hooks/useToast';
import { ErrorMessage } from '@/components/ErrorMessage';
import { EmptyState } from '@/components/EmptyState';
import { TableSkeleton } from '@/components/loading/TableSkeleton';
import type { BaseTableRow, GenericDataTableConfig } from '@/types/table';
import styles from './DataTable.module.css';

export function GenericDataTable<TRow extends BaseTableRow>({
  useStore,
  useColumnStore,
  metricColumns,
  columnGroups,
  colorClassName,
  showColumnTooltips = false,
}: GenericDataTableConfig<TRow>) {
  const {
    reportData,
    loadedDimensions,
    expandedRowKeys,
    setExpandedRowKeys,
    sortColumn,
    sortDirection,
    setSort,
    isLoading,
    hasLoadedOnce,
    loadChildData,
    loadData,
    error,
  } = useStore();
  const { visibleColumns } = useColumnStore();
  const toast = useToast();

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
            <span
              className={`${styles.attributeText} ${
                record.depth === 0 ? styles.attributeTextBold : ''
              }`}
            >
              {formatAttributeValue(value)}
            </span>
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
          title: showColumnTooltips && col.description ? (
            <Tooltip title={col.description} placement="top">
              <span style={{ cursor: 'help' }}>{col.shortLabel}</span>
            </Tooltip>
          ) : col.shortLabel,
          dataIndex: ['metrics', col.id],
          key: col.id,
          width: col.width,
          align: col.align,
          sorter: true,
          sortOrder: sortColumn === col.id ? sortDirection : null,
          showSorterTooltip: false,
          render: (value: number) => <MetricCell value={value ?? 0} format={col.format} />,
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
    toast,
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

  // Implement native drag scrolling and scroll synchronization
  useEffect(() => {
    const timer = setTimeout(() => {
      const tableContainer = tableRef.current;
      if (!tableContainer) return;

      const header = tableContainer.querySelector('.ant-table-header') as HTMLElement;
      const body = tableContainer.querySelector('.ant-table-body') as HTMLElement;

      if (!header || !body) return;

      // Sync header scroll with body
      const syncScroll = () => {
        header.scrollLeft = body.scrollLeft;
      };
      body.addEventListener('scroll', syncScroll);

      // Drag scrolling implementation
      let isDown = false;
      let startX: number;
      let scrollLeft: number;

      const handleMouseDown = (e: MouseEvent) => {
        // Don't interfere with interactive elements
        const target = e.target as HTMLElement;
        if (target.closest('button, a, .ant-table-column-sorters')) return;

        isDown = true;
        body.style.cursor = 'grabbing';
        startX = e.pageX - body.offsetLeft;
        scrollLeft = body.scrollLeft;
      };

      const handleMouseLeave = () => {
        isDown = false;
        body.style.cursor = 'grab';
      };

      const handleMouseUp = () => {
        isDown = false;
        body.style.cursor = 'grab';
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - body.offsetLeft;
        const walk = (x - startX) * 2; // Scroll speed multiplier
        body.scrollLeft = scrollLeft - walk;
      };

      body.addEventListener('mousedown', handleMouseDown);
      body.addEventListener('mouseleave', handleMouseLeave);
      body.addEventListener('mouseup', handleMouseUp);
      body.addEventListener('mousemove', handleMouseMove);

      // Cleanup
      return () => {
        body.removeEventListener('scroll', syncScroll);
        body.removeEventListener('mousedown', handleMouseDown);
        body.removeEventListener('mouseleave', handleMouseLeave);
        body.removeEventListener('mouseup', handleMouseUp);
        body.removeEventListener('mousemove', handleMouseMove);
      };
    }, 0); // Run immediately on next tick

    return () => clearTimeout(timer);
  }, [reportData, isLoading]);

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
        dataSource={reportData}
        loading={isLoading && reportData.length > 0}
        pagination={false}
        size="middle"
        scroll={{ x: 'max-content' }}
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
