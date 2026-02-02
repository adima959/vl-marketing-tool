'use client';

import { useState, useEffect } from 'react';
import { Modal, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MetricClickContext, DetailRecord } from '@/types/dashboardDetails';
import { fetchDashboardDetails } from '@/lib/api/dashboardDetailsClient';
import styles from './CustomerSubscriptionDetailModal.module.css';

interface CustomerSubscriptionDetailModalProps {
  open: boolean;
  onClose: () => void;
  context: MetricClickContext | null;
}

/**
 * Universal modal for displaying detailed customer subscription/order records
 * Can be used anywhere in the application to show:
 * - Individual subscriptions/invoices with customer info
 * - Tracking IDs, amounts, dates
 * - Status indicators (NEW badge, approved checkmark, cancelled X)
 *
 * Features:
 * - NEW badge: Shows for customers where registration date = subscription date
 * - Green checkmark: Approved orders (is_marked = 1)
 * - Red X: Cancelled subscriptions (status 4 or 5) with reason tooltip
 */
export function CustomerSubscriptionDetailModal({ open, onClose, context }: CustomerSubscriptionDetailModalProps) {
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

  // Table columns
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <Tooltip title={name} placement="topLeft">
            <a
              href={`https://vitaliv.no/admin/customers/${record.customerId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-accent-blue)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}
              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
            >
              {name}
            </a>
          </Tooltip>
          {record.customerDateRegistered &&
           new Date(record.customerDateRegistered).toDateString() === new Date(record.date).toDateString() && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '4px',
              backgroundColor: '#f9fafb',
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 'var(--font-weight-medium)',
              color: '#6b7280',
              border: '1px solid rgba(107, 114, 128, 0.1)',
              marginLeft: 'var(--spacing-xs)',
              flexShrink: 0
            }}>
              NEW
            </span>
          )}
          {!!record.isApproved && (
            <Tooltip title="Approved" placement="top">
              <span style={{
                color: 'var(--color-success)',
                marginLeft: 'var(--spacing-xs)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-bold)',
                cursor: 'default',
                flexShrink: 0
              }}>
                ✓
              </span>
            </Tooltip>
          )}
          {(record.subscriptionStatus === 4 || record.subscriptionStatus === 5) && (
            <Tooltip
              title={
                <div>
                  <div>Status: {record.subscriptionStatus === 4 ? 'Soft Cancel' : 'Cancel Forever'}</div>
                  <div>Reason: {record.cancelReason || 'No reason provided'}</div>
                  {record.cancelReasonAbout && <div>Details: {record.cancelReasonAbout}</div>}
                </div>
              }
              placement="top"
            >
              <span style={{
                color: 'var(--color-error)',
                marginLeft: 'var(--spacing-xs)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-bold)',
                cursor: 'default',
                flexShrink: 0
              }}>
                ✕
              </span>
            </Tooltip>
          )}
        </div>
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
        rowKey={(record) => {
          // Create unique key from multiple fields to handle duplicate IDs
          const trackingKey = [
            record.trackingId1,
            record.trackingId2,
            record.trackingId3,
            record.trackingId4,
            record.trackingId5
          ].filter(Boolean).join('-') || 'none';

          // Include optional fields to ensure uniqueness
          const optionalKey = [
            record.subscriptionId,
            record.invoiceId,
            record.productName,
            record.country,
            record.customerEmail
          ].filter(Boolean).join('-');

          return `${record.id}-${record.customerId}-${record.date}-${record.amount}-${trackingKey}-${optionalKey}`;
        }}
        scroll={{ x: 1120 }}
        size="small"
      />
    </Modal>
  );
}
