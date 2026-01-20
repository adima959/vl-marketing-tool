import { Table } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { useMemo } from 'react';
import { MetricCell } from './MetricCell';
import { METRIC_COLUMNS } from '@/config/columns';
import { useReportStore } from '@/stores/reportStore';
import { useColumnStore } from '@/stores/columnStore';
import { ErrorMessage } from '@/components/ErrorMessage';
import { EmptyState } from '@/components/EmptyState';
import type { ReportRow } from '@/types';
import styles from './DataTable.module.css';

export function DataTable() {
  const {
    reportData,
    loadedDimensions,
    expandedRowKeys,
    setExpandedRowKeys,
    sortColumn,
    sortDirection,
    setSort,
    isLoading,
    loadChildData,
    loadData,
    error,
  } = useReportStore();
  const { visibleColumns } = useColumnStore();

  // Build columns from config
  const columns: ColumnsType<ReportRow> = useMemo(() => {
    // First column: Attributes (always visible)
    const attributeColumn: ColumnsType<ReportRow>[0] = {
      title: 'Attributes',
      dataIndex: 'attribute',
      key: 'attribute',
      fixed: 'left',
      width: 400,
      render: (value: string, record: ReportRow) => {
        const indent = record.depth * 20; // 20px per level
        const isExpanded = expandedRowKeys.includes(record.key);

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
                      await loadChildData(record.key, record.attribute, record.depth);
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
              {value}
            </span>
          </div>
        );
      },
    };

    // Metric columns based on visibility
    const metricColumns: ColumnsType<ReportRow> = METRIC_COLUMNS
      .filter((col) => visibleColumns.includes(col.id))
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

    return [attributeColumn, ...metricColumns];
  }, [visibleColumns, sortColumn, sortDirection, expandedRowKeys, setExpandedRowKeys, loadChildData]);

  // Handle sort change
  const handleTableChange: TableProps<ReportRow>['onChange'] = (
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
  const handleExpand = async (expanded: boolean, record: ReportRow) => {
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

  // Show error state
  if (error) {
    return <ErrorMessage error={error} onRetry={loadData} />;
  }

  // Show empty state when not loading and no data
  if (!isLoading && reportData.length === 0) {
    return <EmptyState onLoadData={loadData} />;
  }

  return (
    <div className={styles.dataTable}>
      <Table<ReportRow>
        columns={columns}
        dataSource={reportData}
        loading={isLoading}
        pagination={false}
        size="middle"
        scroll={{ x: 'max-content', y: 'calc(100vh - 250px)' }}
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
