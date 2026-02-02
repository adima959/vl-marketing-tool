'use client';

import { useState, useEffect } from 'react';
import { Modal, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import type { DetailRecord } from '@/types/dashboardDetails';
import { fetchMarketingDetails } from '@/lib/api/marketingDetailsClient';
import styles from './CustomerSubscriptionDetailModal.module.css';

interface MarketingSubscriptionDetailModalProps {
  open: boolean;
  onClose: () => void;
  context: MarketingMetricClickContext | null;
}

/**
 * Modal for displaying detailed CRM subscription/order records from Marketing Report
 * Shows individual subscriptions/invoices with customer info, tracking IDs, amounts, dates
 *
 * Features:
 * - NEW badge: Shows for customers where registration date = subscription date
 * - Green checkmark: Approved orders (is_marked = 1)
 * - Red X: Cancelled subscriptions (status 4 or 5) with reason tooltip
 */
export function MarketingSubscriptionDetailModal({ open, onClose, context }: MarketingSubscriptionDetailModalProps) {
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
      const result = await fetchMarketingDetails(context, {
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

  // Build filter summary for display
  const buildFilterSummary = () => {
    if (!context) return [];

    const parts: string[] = [];

    // Date range
    parts.push(
      `${context.filters.dateRange.start.toLocaleDateString('en-GB')} - ${context.filters.dateRange.end.toLocaleDateString('en-GB')}`
    );

    // Marketing dimension filters
    if (context.filters.network) {
      parts.push(`Network: ${context.filters.network}`);
    }
    if (context.filters.campaign) {
      parts.push(`Campaign: ${context.filters.campaign}`);
    }
    if (context.filters.adset) {
      parts.push(`Ad Set: ${context.filters.adset}`);
    }
    if (context.filters.ad) {
      parts.push(`Ad: ${context.filters.ad}`);
    }
    if (context.filters.date) {
      parts.push(`Date: ${new Date(context.filters.date).toLocaleDateString('en-GB')}`);
    }

    return parts;
  };

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
      title: 'Campaign ID',
      dataIndex: 'trackingId4',
      width: 120,
      ellipsis: {
        showTitle: false,
      },
      render: (val) => <Tooltip title={val || '-'}>{val || '-'}</Tooltip>,
    },
    {
      title: 'Ad Set ID',
      dataIndex: 'trackingId2',
      width: 120,
      ellipsis: {
        showTitle: false,
      },
      render: (val) => <Tooltip title={val || '-'}>{val || '-'}</Tooltip>,
    },
    {
      title: 'Ad ID',
      dataIndex: 'trackingId1',
      width: 120,
      ellipsis: {
        showTitle: false,
      },
      render: (val) => <Tooltip title={val || '-'}>{val || '-'}</Tooltip>,
    },
    {
      title: 'Product',
      dataIndex: 'productName',
      width: 150,
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

  const filterParts = buildFilterSummary();

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
          {filterParts.map((part, index) => (
            <span key={index}>
              <span className={styles.separator}>•</span>
              <span className={styles.summaryText}>{part}</span>
            </span>
          ))}
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
