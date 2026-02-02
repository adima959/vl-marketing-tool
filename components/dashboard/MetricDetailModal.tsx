'use client';

import { useState, useEffect } from 'react';
import { Modal, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MetricClickContext, DetailRecord } from '@/types/dashboardDetails';
import { fetchDashboardDetails } from '@/lib/api/dashboardDetailsClient';
import styles from './MetricDetailModal.module.css';

interface MetricDetailModalProps {
  open: boolean;
  onClose: () => void;
  context: MetricClickContext | null;
}

/**
 * Modal that displays detailed records for a clicked metric
 * Shows individual subscriptions/invoices with customer info, tracking IDs, amounts
 */
export function MetricDetailModal({ open, onClose, context }: MetricDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ records: DetailRecord[]; total: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Fetch data when modal opens or page changes
  useEffect(() => {
    if (open && context) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context, currentPage]);

  const loadData = async () => {
    if (!context) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchDashboardDetails(context, {
        page: currentPage,
        pageSize,
      });
      setData({ records: result.records, total: result.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  // Reset page when modal opens with new context
  useEffect(() => {
    if (open) {
      setCurrentPage(1);
    }
  }, [open, context?.metricId]);

  // Table columns (consistent for all metrics per user preference)
  const columns: ColumnsType<DetailRecord> = [
    {
      title: 'Customer Name',
      dataIndex: 'customerName',
      width: 180,
      fixed: 'left',
      ellipsis: {
        showTitle: false,
      },
      render: (name: string, record: DetailRecord) => (
        <Tooltip title={name} placement="topLeft">
          <a
            href={`https://vitaliv.no/admin/customers/${record.customerId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-accent-blue)', textDecoration: 'none' }}
            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
          >
            {name}
          </a>
        </Tooltip>
      ),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      width: 120,
      ellipsis: {
        showTitle: false,
      },
      render: (val) => <Tooltip title={val}>{val}</Tooltip>,
    },
    {
      title: 'Tracking ID 1',
      dataIndex: 'trackingId1',
      width: 120,
      ellipsis: {
        showTitle: false,
      },
      render: (val) => <Tooltip title={val || '-'}>{val || '-'}</Tooltip>,
    },
    {
      title: 'Tracking ID 2',
      dataIndex: 'trackingId2',
      width: 120,
      ellipsis: {
        showTitle: false,
      },
      render: (val) => <Tooltip title={val || '-'}>{val || '-'}</Tooltip>,
    },
    {
      title: 'Tracking ID 3',
      dataIndex: 'trackingId3',
      width: 120,
      ellipsis: {
        showTitle: false,
      },
      render: (val) => <Tooltip title={val || '-'}>{val || '-'}</Tooltip>,
    },
    {
      title: 'Tracking ID 4',
      dataIndex: 'trackingId4',
      width: 120,
      ellipsis: {
        showTitle: false,
      },
      render: (val) => <Tooltip title={val || '-'}>{val || '-'}</Tooltip>,
    },
    {
      title: 'Tracking ID 5',
      dataIndex: 'trackingId5',
      width: 120,
      ellipsis: {
        showTitle: false,
      },
      render: (val) => <Tooltip title={val || '-'}>{val || '-'}</Tooltip>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      width: 100,
      align: 'right',
      ellipsis: {
        showTitle: false,
      },
      render: (val) => {
        const formatted = val !== null && val !== undefined ? Number(val).toFixed(2) : '0.00';
        return <Tooltip title={formatted}>{formatted}</Tooltip>;
      },
    },
    {
      title: 'Date',
      dataIndex: 'date',
      width: 120,
      ellipsis: {
        showTitle: false,
      },
      render: (val) => {
        const formatted = new Date(val).toLocaleDateString('en-GB');
        return <Tooltip title={formatted}>{formatted}</Tooltip>;
      },
    },
  ];

  return (
    <Modal
      title={context ? `${context.metricLabel} Details` : 'Details'}
      open={open}
      onCancel={onClose}
      width={1200}
      centered
      footer={null}
      className={styles.modal}
      styles={{
        header: { paddingBottom: 12, borderBottom: '1px solid #e8eaed' },
        body: { paddingTop: 0 },
      }}
    >
      {context && (
        <div className={styles.filterSummary}>
          <span className={styles.summaryCount}>{context.value} records</span>
          <span className={styles.separator}>•</span>
          <span className={styles.summaryText}>
            {context.filters.dateRange.start.toLocaleDateString('en-GB')} - {context.filters.dateRange.end.toLocaleDateString('en-GB')}
          </span>
          {context.filters.country && (
            <>
              <span className={styles.separator}>•</span>
              <span className={styles.summaryText}>{context.filters.country}</span>
            </>
          )}
          {context.filters.product && (
            <>
              <span className={styles.separator}>•</span>
              <span className={styles.summaryText}>{context.filters.product}</span>
            </>
          )}
          {context.filters.source && (
            <>
              <span className={styles.separator}>•</span>
              <span className={styles.summaryText}>{context.filters.source}</span>
            </>
          )}
        </div>
      )}

      {error && (
        <div className={styles.error}>
          Error: {error}
        </div>
      )}

      <Table
        columns={columns}
        dataSource={data?.records || []}
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize,
          total: data?.total || 0,
          onChange: setCurrentPage,
          showSizeChanger: false,
          showTotal: (total) => `Total ${total} records`,
        }}
        rowKey="id"
        scroll={{ x: 1120 }}
        size="small"
      />
    </Modal>
  );
}
