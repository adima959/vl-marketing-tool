'use client';

import { Table, Tooltip } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { useMemo, useRef, useState } from 'react';
import { ValidationRateCell, MIN_SUBSCRIPTIONS_THRESHOLD } from './ValidationRateCell';
import { useToast } from '@/hooks/useToast';
import { useDragScroll } from '@/hooks/useDragScroll';
import { EmptyState } from '@/components/EmptyState';
import { TableSkeleton } from '@/components/loading/TableSkeleton';
import { CrmDetailModal } from '@/components/modals/CrmDetailModal';
import { TableInfoBanner } from '@/components/ui/TableInfoBanner';
import { injectSkeletonRows, isSkeletonRow } from '@/lib/utils/tableUtils';
import type { ValidationRateRow, ValidationRateStore } from '@/types';
import type { MetricClickContext } from '@/types/dashboardDetails';
import type { UseBoundStore, StoreApi } from 'zustand';
import styles from '@/styles/tables/base.module.css';
import compactStyles from './ValidationRateDataTable.module.css';

/**
 * Validation Rate Data Table
 *
 * Shared pivot-style table for all validation rate pages (approval, pay, buy).
 * - Rows: Hierarchical dimensions (country -> source -> product)
 * - Columns: Dynamic time periods (weekly/biweekly/monthly)
 * - Values: Color-coded rate percentages
 *
 * Accepts a store hook as prop for use across different rate types.
 */

interface ValidationRateDataTableProps {
  useStore: UseBoundStore<StoreApi<ValidationRateStore>>;
  promptTitle?: string;
  promptText?: string;
  rateType?: 'approval' | 'pay' | 'buy';  // For modal query logic
  modalRecordLabel?: string;  // Label for records in modal (e.g., "Trials" or "Invoices")
}

export function ValidationRateDataTable({
  useStore,
  promptTitle = 'Ready to analyze rates?',
  promptText = 'Select your dimensions, time period, and date range above, then click "Load Data" to get started.',
  rateType,
  modalRecordLabel = 'Trials',
}: ValidationRateDataTableProps) {
  const {
    reportData,
    periodColumns,
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
    dimensions,
  } = useStore();
  const toast = useToast();
  const tableRef = useRef<HTMLDivElement>(null);

  // Drag-to-scroll + header/body scroll sync
  useDragScroll(tableRef);

  // Modal state
  const [modalContext, setModalContext] = useState<MetricClickContext | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Calculate table width: attribute column + period columns
  const tableWidth = useMemo(() => {
    const attributeWidth = 250;
    const periodWidth = 110; // Width per period column
    return attributeWidth + periodColumns.length * periodWidth;
  }, [periodColumns]);

  // Process data to inject skeleton rows for expanded parents that are loading
  const processedData = useMemo(() => {
    if (!isLoadingSubLevels) return reportData;
    return injectSkeletonRows(reportData, expandedRowKeys, 2);
  }, [reportData, expandedRowKeys, isLoadingSubLevels]);

  // Helper to build dimension filters from row key
  const buildFilters = (rowKey: string) => {
    const parts = rowKey.split('::');
    const filters: Record<string, string> = {};

    dimensions.forEach((dim, index) => {
      // Check for undefined, not falsy - empty string '' is a valid filter value
      if (parts[index] !== undefined) {
        // Convert empty string to 'Unknown' so details query knows to filter for NULL/empty
        filters[dim] = parts[index] === '' ? 'Unknown' : parts[index];
      }
    });

    return filters;
  };

  // Handle metric click
  const handleMetricClick = (row: ValidationRateRow, periodKey: string, periodLabel: string, periodStart: string, periodEnd: string) => {
    const metric = row.metrics[periodKey];
    if (!metric || metric.trials === 0) return;

    const filters = buildFilters(row.key);

    const context: MetricClickContext = {
      metricId: 'trials',
      metricLabel: `${modalRecordLabel} (${periodLabel})`,
      value: metric.trials,
      filters: {
        dateRange: {
          start: new Date(periodStart),
          end: new Date(periodEnd),
        },
        country: filters.country,
        product: filters.product,
        source: filters.source,
        excludeDeleted: false,
        excludeUpsellTags: false,
        rateType,
      },
    };

    setModalContext(context);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setTimeout(() => setModalContext(null), 300);
  };

  // Build columns from period columns
  const columns: ColumnsType<ValidationRateRow> = useMemo(() => {
    // Attribute column (fixed left)
    const attributeColumn: ColumnsType<ValidationRateRow>[0] = {
      title: 'Attributes',
      dataIndex: 'attribute',
      key: 'attribute',
      fixed: 'left',
      width: 250,
      render: (value: string, record: ValidationRateRow) => {
        const indent = record.depth * 20;
        const isExpanded = expandedRowKeys.includes(record.key);

        // Render skeleton row
        if (isSkeletonRow(record)) {
          return (
            <div className={styles.attributeCell} style={{ paddingLeft: `${indent}px` }}>
              <span className={styles.expandSpacer} />
              <div className={styles.skeletonText} />
            </div>
          );
        }

        return (
          <div className={styles.attributeCell} style={{ paddingLeft: `${indent}px` }}>
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
                      } catch {
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
            <Tooltip title={value} placement="topLeft" mouseEnterDelay={0.5}>
              <span
                className={`${styles.attributeText} ${
                  record.depth === 0 ? styles.attributeTextBold : ''
                }`}
              >
                {value}
              </span>
            </Tooltip>
          </div>
        );
      },
    };

    // Period columns (dynamic based on date range and time period selection)
    const periodCols = periodColumns.map((period) => ({
      title: (
        <Tooltip title={`${period.startDate} to ${period.endDate}`} placement="top">
          <span style={{ cursor: 'default' }}>{period.label}</span>
        </Tooltip>
      ),
      dataIndex: ['metrics', period.key],
      key: period.key,
      width: 110,
      align: 'center' as const,
      sorter: true,
      sortOrder: sortColumn === period.key ? sortDirection : null,
      showSorterTooltip: false,
      render: (metric: { rate: number; trials: number; approved: number } | undefined, record: ValidationRateRow) => {
        // Render skeleton for loading rows
        if (isSkeletonRow(record)) {
          return <div className={styles.skeletonMetric} />;
        }
        return (
          <ValidationRateCell
            metric={metric ?? { rate: 0, trials: 0, approved: 0 }}
            onClick={() => handleMetricClick(record, period.key, period.label, period.startDate, period.endDate)}
          />
        );
      },
    }));

    return [attributeColumn, ...periodCols];
  }, [
    periodColumns,
    expandedRowKeys,
    setExpandedRowKeys,
    loadChildData,
    sortColumn,
    sortDirection,
    toast,
    dimensions,
  ]);

  // Handle sort change
  const handleTableChange: TableProps<ValidationRateRow>['onChange'] = (
    _pagination,
    _filters,
    sorter
  ) => {
    if (!Array.isArray(sorter)) {
      setSort(sorter.columnKey as string ?? null, sorter.order ?? null);
    }
  };

  // Loading skeleton
  if (isLoading && reportData.length === 0) {
    return <TableSkeleton rows={10} columns={periodColumns.length + 1} />;
  }

  // Initial prompt
  if (!hasLoadedOnce && !isLoading && reportData.length === 0) {
    return (
      <div className={styles.initialPrompt}>
        <h3 className={styles.promptTitle}>{promptTitle}</h3>
        <p className={styles.promptText}>{promptText}</p>
      </div>
    );
  }

  // Empty state
  if (hasLoadedOnce && !isLoading && reportData.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {hasLoadedOnce && reportData.length > 0 && (
        <TableInfoBanner
          messages={[`Cells with less than ${MIN_SUBSCRIPTIONS_THRESHOLD} subscriptions are filtered out.`]}
        />
      )}

      <div ref={tableRef} className={`${styles.dataTable} ${compactStyles.compactTable}`}>
        <Table<ValidationRateRow>
          columns={columns}
          dataSource={processedData}
          loading={isLoading && reportData.length > 0}
          pagination={false}
          size="small"
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

      <CrmDetailModal
        open={modalOpen}
        onClose={handleModalClose}
        variant="dashboard"
        context={modalContext}
      />
    </>
  );
}
