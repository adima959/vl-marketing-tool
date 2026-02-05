'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal, Table, Tooltip, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
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
 * Used by Dashboard and Approval Rate reports
 */
export function CustomerSubscriptionDetailModal({ open, onClose, context }: CustomerSubscriptionDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ records: DetailRecord[]; total: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;

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

  useEffect(() => {
    if (open) {
      setCurrentPage(1);
    }
  }, [open, context?.metricId]);

  const exportToCSV = useCallback(async () => {
    if (!context || !data?.total) return;

    setExporting(true);

    try {
      const allData = await fetchDashboardDetails(context, {
        page: 1,
        pageSize: Math.min(data.total, 10000),
      });

      const headers = [
        'Customer Name',
        'Source',
        'Tracking ID 1',
        'Tracking ID 2',
        'Tracking ID 3',
        'Tracking ID 4',
        'Tracking ID 5',
        'Amount',
        'Date',
      ];

      const csvRows = [
        headers.join(','),
        ...allData.records.map((record) => {
          const row = [
            `"${(record.customerName || '').replace(/"/g, '""')}"`,
            `"${(record.source || '').replace(/"/g, '""')}"`,
            `"${(record.trackingId1 || '').replace(/"/g, '""')}"`,
            `"${(record.trackingId2 || '').replace(/"/g, '""')}"`,
            `"${(record.trackingId3 || '').replace(/"/g, '""')}"`,
            `"${(record.trackingId4 || '').replace(/"/g, '""')}"`,
            `"${(record.trackingId5 || '').replace(/"/g, '""')}"`,
            record.amount !== null && record.amount !== undefined ? Number(record.amount).toFixed(2) : '0.00',
            new Date(record.date).toLocaleDateString('en-GB'),
          ];
          return row.join(',');
        }),
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${context.metricLabel || 'details'}_export.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [context, data?.total]);

  // Build filter tags
  const filterTags: string[] = [];
  if (context) {
    const { start, end } = context.filters.dateRange;
    filterTags.push(`${start.toLocaleDateString('en-GB')} – ${end.toLocaleDateString('en-GB')}`);
    if (context.filters.country) filterTags.push(context.filters.country);
    if (context.filters.product) filterTags.push(context.filters.product);
    if (context.filters.source) filterTags.push(context.filters.source);
  }

  const columns: ColumnsType<DetailRecord> = [
    {
      title: 'Customer',
      dataIndex: 'customerName',
      width: 190,
      fixed: 'left',
      ellipsis: { showTitle: false },
      render: (name: string, record: DetailRecord) => (
        <div className={styles.customerCell}>
          <Tooltip title={name} placement="topLeft">
            <a
              href={`https://vitaliv.no/admin/customers/${record.customerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.customerLink}
            >
              {name}
            </a>
          </Tooltip>
          {record.customerDateRegistered &&
           new Date(record.customerDateRegistered).toDateString() === new Date(record.date).toDateString() && (
            <span className={styles.badgeNew}>NEW</span>
          )}
          {!!record.isApproved && (
            <Tooltip title="Approved">
              <span className={styles.badgeApproved}>✓</span>
            </Tooltip>
          )}
          {(record.subscriptionStatus === 4 || record.subscriptionStatus === 5) && (
            <Tooltip
              title={
                <div>
                  <div>{record.subscriptionStatus === 4 ? 'Soft Cancel' : 'Cancel Forever'}</div>
                  {record.cancelReason && <div>{record.cancelReason}</div>}
                  {record.cancelReasonAbout && <div>{record.cancelReasonAbout}</div>}
                </div>
              }
            >
              <span className={styles.badgeCancelled}>✕</span>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      width: 100,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val}><span className={styles.sourceCell}>{val}</span></Tooltip>,
    },
    {
      title: 'Tracking 1',
      dataIndex: 'trackingId1',
      width: 110,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>,
    },
    {
      title: 'Tracking 2',
      dataIndex: 'trackingId2',
      width: 110,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>,
    },
    {
      title: 'Tracking 3',
      dataIndex: 'trackingId3',
      width: 110,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>,
    },
    {
      title: 'Tracking 4',
      dataIndex: 'trackingId4',
      width: 110,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>,
    },
    {
      title: 'Tracking 5',
      dataIndex: 'trackingId5',
      width: 110,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      width: 90,
      align: 'right',
      render: (val) => {
        const formatted = val !== null && val !== undefined ? Number(val).toFixed(2) : '0.00';
        return <span className={styles.amountCell}>{formatted}</span>;
      },
    },
    {
      title: 'Date',
      dataIndex: 'date',
      width: 90,
      render: (val) => (
        <span className={styles.dateCell}>
          {new Date(val).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
        </span>
      ),
    },
  ];

  return (
    <Modal
      title="Details"
      open={open}
      onCancel={onClose}
      width={1200}
      centered
      footer={null}
      className={styles.modal}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>
            {context?.metricLabel || 'Details'}
          </span>
          <span className={styles.recordCount}>
            {data?.total ?? context?.value ?? 0} records
          </span>
        </div>
        <div className={styles.headerRight}>
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            onClick={exportToCSV}
            disabled={!data?.total || exporting}
            loading={exporting}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </div>

      {filterTags.length > 0 && (
        <div className={styles.filterBar}>
          {filterTags.map((tag, i) => (
            <span key={i} className={styles.filterTag}>{tag}</span>
          ))}
        </div>
      )}

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      <div className={styles.tableWrap}>
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
            showTotal: (total) => (
              <span style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>
                {total} total
              </span>
            ),
          }}
          rowKey="id"
          scroll={{ x: 1120 }}
          size="small"
        />
      </div>
    </Modal>
  );
}
