'use client';

import { Table, Tooltip } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { useMemo, useEffect, useRef, useState } from 'react';
import { ApprovalRateCell } from './ApprovalRateCell';
import { useApprovalRateStore } from '@/stores/approvalRateStore';
import { useToast } from '@/hooks/useToast';
import { ErrorMessage } from '@/components/ErrorMessage';
import { EmptyState } from '@/components/EmptyState';
import { TableSkeleton } from '@/components/loading/TableSkeleton';
import { CustomerSubscriptionDetailModal } from '@/components/modals/CustomerSubscriptionDetailModal';
import type { ApprovalRateRow } from '@/types';
import type { MetricClickContext } from '@/types/dashboardDetails';
import styles from '@/styles/tables/base.module.css';
import compactStyles from './ApprovalRateDataTable.module.css';

/**
 * Approval Rate Data Table
 *
 * Pivot-style table with:
 * - Rows: Hierarchical dimensions (country → source → product)
 * - Columns: Dynamic time periods (weekly/biweekly/monthly)
 * - Values: Color-coded approval rate percentages
 */
// Extended row type to support skeleton rows
type ApprovalRateRowWithSkeleton = ApprovalRateRow & { _isSkeleton?: boolean };

export function ApprovalRateDataTable() {
  const {
    reportData,
    periodColumns,
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
    dimensions,
  } = useApprovalRateStore();
  const toast = useToast();
  const tableRef = useRef<HTMLDivElement>(null);

  // Modal state
  const [modalContext, setModalContext] = useState<MetricClickContext | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Track which rows are currently loading children
  const [loadingRowKeys, setLoadingRowKeys] = useState<Set<string>>(new Set());

  // Calculate table width: attribute column + period columns
  const tableWidth = useMemo(() => {
    const attributeWidth = 350;
    const periodWidth = 110; // Width per period column
    return attributeWidth + periodColumns.length * periodWidth;
  }, [periodColumns]);

  // Process data to inject skeleton rows for expanded parents that are loading
  const processedData = useMemo(() => {
    if (loadingRowKeys.size === 0) return reportData;

    const injectSkeletons = (rows: ApprovalRateRow[]): ApprovalRateRowWithSkeleton[] => {
      return rows.map((row) => {
        const isExpanded = expandedRowKeys.includes(row.key);
        const isLoadingChildren = loadingRowKeys.has(row.key);
        const needsSkeleton = isExpanded && isLoadingChildren && (!row.children || row.children.length === 0);

        if (needsSkeleton) {
          // Create 2 skeleton placeholder children
          const skeletonChildren: ApprovalRateRowWithSkeleton[] = [1, 2].map((i) => ({
            key: `${row.key}::skeleton-${i}`,
            attribute: '',
            depth: row.depth + 1,
            hasChildren: false,
            metrics: {},
            _isSkeleton: true,
          }));
          return { ...row, children: skeletonChildren };
        }

        // Recursively process children
        if (row.children && row.children.length > 0) {
          return { ...row, children: injectSkeletons(row.children) };
        }

        return row;
      });
    };

    return injectSkeletons(reportData);
  }, [reportData, expandedRowKeys, loadingRowKeys]);

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
  const handleMetricClick = (row: ApprovalRateRow, periodKey: string, periodLabel: string, periodStart: string, periodEnd: string) => {
    const metric = row.metrics[periodKey];
    if (!metric || metric.trials === 0) return;

    const filters = buildFilters(row.key);

    const context: MetricClickContext = {
      metricId: 'trials',
      metricLabel: `Trials (${periodLabel})`,
      value: metric.trials,
      filters: {
        dateRange: {
          start: new Date(periodStart),
          end: new Date(periodEnd),
        },
        country: filters.country,
        product: filters.product,
        source: filters.source,
        // Approval rate page needs to exclude deleted subscriptions and upsell invoices
        // to match the aggregate counts in the table
        excludeDeleted: true,
        excludeUpsellTags: true,
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
  const columns: ColumnsType<ApprovalRateRowWithSkeleton> = useMemo(() => {
    // Attribute column (fixed left)
    const attributeColumn: ColumnsType<ApprovalRateRowWithSkeleton>[0] = {
      title: 'Attributes',
      dataIndex: 'attribute',
      key: 'attribute',
      fixed: 'left',
      width: 350,
      render: (value: string, record: ApprovalRateRowWithSkeleton) => {
        const indent = record.depth * 20;
        const isExpanded = expandedRowKeys.includes(record.key);

        // Render skeleton row
        if (record._isSkeleton) {
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
                    setExpandedRowKeys([...expandedRowKeys, record.key]);
                    if (!record.children || record.children.length === 0) {
                      // Start loading - add to loading set
                      setLoadingRowKeys((prev) => new Set(prev).add(record.key));
                      try {
                        await loadChildData(record.key, record.attribute, record.depth);
                      } catch {
                        setExpandedRowKeys(expandedRowKeys.filter((k) => k !== record.key));
                        toast.error('Failed to load child data. Please try again.');
                      } finally {
                        // Done loading - remove from loading set
                        setLoadingRowKeys((prev) => {
                          const next = new Set(prev);
                          next.delete(record.key);
                          return next;
                        });
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
      render: (metric: { rate: number; trials: number; approved: number } | undefined, record: ApprovalRateRowWithSkeleton) => {
        // Render skeleton for loading rows
        if (record._isSkeleton) {
          return <div className={styles.skeletonMetric} />;
        }
        return (
          <ApprovalRateCell
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
  const handleTableChange: TableProps<ApprovalRateRowWithSkeleton>['onChange'] = (
    _pagination,
    _filters,
    sorter
  ) => {
    if (!Array.isArray(sorter)) {
      setSort(sorter.columnKey as string ?? null, sorter.order ?? null);
    }
  };

  // Implement drag scrolling and scroll synchronization
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

      // Drag scrolling
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

  // Error state
  if (error) {
    return <ErrorMessage error={error} onRetry={loadData} />;
  }

  // Loading skeleton
  if (isLoading && reportData.length === 0) {
    return <TableSkeleton rows={10} columns={periodColumns.length + 1} />;
  }

  // Initial prompt
  if (!hasLoadedOnce && !isLoading && reportData.length === 0) {
    return (
      <div className={styles.initialPrompt}>
        <h3 className={styles.promptTitle}>Ready to analyze approval rates?</h3>
        <p className={styles.promptText}>
          Select your dimensions, time period, and date range above, then click "Load Data" to get
          started.
        </p>
      </div>
    );
  }

  // Empty state
  if (hasLoadedOnce && !isLoading && reportData.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <div ref={tableRef} className={`${styles.dataTable} ${compactStyles.compactTable}`}>
        <Table<ApprovalRateRowWithSkeleton>
          columns={columns}
          dataSource={processedData}
          loading={isLoading && reportData.length > 0}
          pagination={false}
          size="small"
          scroll={{ x: tableWidth }}
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

      <CustomerSubscriptionDetailModal
        open={modalOpen}
        onClose={handleModalClose}
        context={modalContext}
      />
    </>
  );
}
