import { Table } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { useMemo, useEffect, useRef } from 'react';
import { MetricCell } from '@/components/table/MetricCell';
import { ON_PAGE_METRIC_COLUMNS } from '@/config/onPageColumns';
import { useOnPageStore } from '@/stores/onPageStore';
import { useOnPageColumnStore } from '@/stores/onPageColumnStore';
import { useToast } from '@/hooks/useToast';
import { ErrorMessage } from '@/components/ErrorMessage';
import { EmptyState } from '@/components/EmptyState';
import { TableSkeleton } from '@/components/loading/TableSkeleton';
import type { OnPageReportRow } from '@/types/onPageReport';
import styles from '@/components/table/DataTable.module.css';
import colorStyles from './OnPageColors.module.css';

export function OnPageDataTable() {
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
  } = useOnPageStore();
  const { visibleColumns } = useOnPageColumnStore();
  const toast = useToast();

  // Build columns from config
  const columns: ColumnsType<OnPageReportRow> = useMemo(() => {
    // First column: Attributes (always visible) - spans both header rows
    const attributeColumn: ColumnsType<OnPageReportRow>[0] = {
      title: 'Attributes',
      dataIndex: 'attribute',
      key: 'attribute',
      fixed: 'left',
      width: 400,
      onHeaderCell: () => ({
        rowSpan: 2,
      }),
      render: (value: string, record: OnPageReportRow) => {
        const indent = record.depth * 20;
        const isExpanded = expandedRowKeys.includes(record.key);

        const formatAttributeValue = (val: string): string => {
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
    const visibleMetrics = ON_PAGE_METRIC_COLUMNS.filter((col) => visibleColumns.includes(col.id));

    // Engagement columns: pageViews, uniqueVisitors, bounceRate, avgActiveTime
    const engagementColumns = visibleMetrics
      .filter((col) => ['pageViews', 'uniqueVisitors', 'bounceRate', 'avgActiveTime'].includes(col.id))
      .map((col) => ({
        title: col.shortLabel,
        dataIndex: ['metrics', col.id],
        key: col.id,
        width: col.width,
        align: col.align,
        sorter: true,
        sortOrder: sortColumn === col.id ? sortDirection : null,
        showSorterTooltip: false,
        render: (value: number) => <MetricCell value={value ?? 0} format={col.format} />,
      }));

    // Interaction columns: scrollPastHero, scrollRate, formViews, formStarters, ctaClicks
    const interactionColumns = visibleMetrics
      .filter((col) => ['scrollPastHero', 'scrollRate', 'formViews', 'formStarters', 'ctaClicks'].includes(col.id))
      .map((col) => ({
        title: col.shortLabel,
        dataIndex: ['metrics', col.id],
        key: col.id,
        width: col.width,
        align: col.align,
        sorter: true,
        sortOrder: sortColumn === col.id ? sortDirection : null,
        showSorterTooltip: false,
        render: (value: number) => <MetricCell value={value ?? 0} format={col.format} />,
      }));

    // Create grouped columns
    const groupedColumns: ColumnsType<OnPageReportRow> = [];

    if (engagementColumns.length > 0) {
      groupedColumns.push({
        title: 'Engagement',
        children: engagementColumns,
      });
    }

    if (interactionColumns.length > 0) {
      groupedColumns.push({
        title: 'Interactions',
        children: interactionColumns,
      });
    }

    return [attributeColumn, ...groupedColumns];
  }, [visibleColumns, sortColumn, sortDirection, expandedRowKeys, setExpandedRowKeys, loadChildData]);

  // Handle sort change
  const handleTableChange: TableProps<OnPageReportRow>['onChange'] = (
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
        const walk = (x - startX) * 2;
        body.scrollLeft = scrollLeft - walk;
      };

      body.addEventListener('mousedown', handleMouseDown);
      body.addEventListener('mouseleave', handleMouseLeave);
      body.addEventListener('mouseup', handleMouseUp);
      body.addEventListener('mousemove', handleMouseMove);

      return () => {
        body.removeEventListener('scroll', syncScroll);
        body.removeEventListener('mousedown', handleMouseDown);
        body.removeEventListener('mouseleave', handleMouseLeave);
        body.removeEventListener('mouseup', handleMouseUp);
        body.removeEventListener('mousemove', handleMouseMove);
      };
    }, 0);

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
          Select your dimensions and date range above, then click &quot;Load Data&quot; to get started.
        </p>
      </div>
    );
  }

  // Show empty state when data has been loaded but no results found
  if (hasLoadedOnce && !isLoading && reportData.length === 0) {
    return <EmptyState onLoadData={loadData} />;
  }

  return (
    <div ref={tableRef} className={`${styles.dataTable} ${colorStyles.onPageColors}`}>
      <Table<OnPageReportRow>
        columns={columns}
        dataSource={reportData}
        loading={isLoading && reportData.length > 0}
        pagination={false}
        size="middle"
        scroll={{ x: 1530 }}
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
