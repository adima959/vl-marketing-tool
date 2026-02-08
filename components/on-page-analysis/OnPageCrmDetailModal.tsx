'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal, Table, Tooltip, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { OnPageViewClickContext } from '@/types/onPageDetails';
import type { DetailRecord } from '@/types/dashboardDetails';
import { fetchOnPageCrmDetails } from '@/lib/api/onPageCrmDetailsClient';
import modalStyles from '@/styles/components/modal.module.css';
import styles from '@/components/modals/CustomerSubscriptionDetailModal.module.css';

interface OnPageCrmDetailModalProps {
  open: boolean;
  onClose: () => void;
  context: OnPageViewClickContext | null;
}

const CRM_METRIC_LABELS: Record<string, string> = {
  crmTrials: 'CRM Trials',
  crmApproved: 'Approved Sales',
};

/**
 * Modal for displaying CRM subscription detail records from On-Page Analysis.
 * Shows individual subscriptions matched by tracking ID dimensions.
 */
export function OnPageCrmDetailModal({ open, onClose, context }: OnPageCrmDetailModalProps) {
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
      const result = await fetchOnPageCrmDetails(context, {
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
      const allData = await fetchOnPageCrmDetails(context, {
        page: 1,
        pageSize: Math.min(data.total, 10000),
      });

      const headers = [
        'Customer Name',
        'Source',
        'Campaign ID',
        'Ad Set ID',
        'Ad ID',
        'Product',
        'Amount',
        'Date',
      ];

      const csvRows = [
        headers.join(','),
        ...allData.records.map((record) => {
          const row = [
            `"${(record.customerName || '').replace(/"/g, '""')}"`,
            `"${(record.source || '').replace(/"/g, '""')}"`,
            `"${(record.trackingId4 || '').replace(/"/g, '""')}"`,
            `"${(record.trackingId2 || '').replace(/"/g, '""')}"`,
            `"${(record.trackingId1 || '').replace(/"/g, '""')}"`,
            `"${(record.productName || '').replace(/"/g, '""')}"`,
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
      link.download = `${CRM_METRIC_LABELS[context.metricId] || 'crm_details'}_export.csv`;
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

  // Build filter tags from dimension filters
  const filterTags: string[] = [];
  if (context) {
    const { start, end } = context.filters.dateRange;
    filterTags.push(`${start.toLocaleDateString('en-GB')} – ${end.toLocaleDateString('en-GB')}`);
    for (const [dim, value] of Object.entries(context.filters.dimensionFilters)) {
      filterTags.push(`${dim}: ${value}`);
    }
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
      title: 'Campaign ID',
      dataIndex: 'trackingId4',
      width: 120,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>,
    },
    {
      title: 'Ad Set ID',
      dataIndex: 'trackingId2',
      width: 120,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>,
    },
    {
      title: 'Ad ID',
      dataIndex: 'trackingId1',
      width: 120,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>,
    },
    {
      title: 'Product',
      dataIndex: 'productName',
      width: 150,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val || '–'}><span className={styles.sourceCell}>{val || '–'}</span></Tooltip>,
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
      className={`${modalStyles.modal} ${styles.modal}`}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>
            {CRM_METRIC_LABELS[context?.metricId ?? ''] || 'Details'}
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
