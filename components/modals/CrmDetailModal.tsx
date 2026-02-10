'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Table, Tooltip, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MetricClickContext, DetailRecord } from '@/types/dashboardDetails';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import type { OnPageViewClickContext } from '@/types/onPageDetails';
import { fetchDashboardDetails } from '@/lib/api/dashboardDetailsClient';
import { fetchMarketingDetails } from '@/lib/api/marketingDetailsClient';
import { fetchOnPageCrmDetails } from '@/lib/api/onPageCrmDetailsClient';
import { TableSkeleton } from '@/components/skeletons/TableSkeleton';
import modalStyles from '@/styles/components/modal.module.css';
import styles from './CrmDetailModal.module.css';

type CrmDetailVariant = 'dashboard' | 'marketing' | 'onPage';

type CrmDetailContext =
  | MetricClickContext
  | MarketingMetricClickContext
  | OnPageViewClickContext;

interface CrmDetailModalProps {
  open: boolean;
  onClose: () => void;
  variant: CrmDetailVariant;
  context: CrmDetailContext | null;
}

const ON_PAGE_METRIC_LABELS: Record<string, string> = {
  crmTrials: 'CRM Trials',
  crmApproved: 'Approved Sales',
};

function getTitle(variant: CrmDetailVariant, context: CrmDetailContext | null): string {
  if (!context) return 'Details';
  if (variant === 'onPage') {
    return ON_PAGE_METRIC_LABELS[context.metricId] || 'Details';
  }
  return context.metricLabel || 'Details';
}

function getFilterTags(variant: CrmDetailVariant, context: CrmDetailContext): string[] {
  const tags: string[] = [];
  const { start, end } = context.filters.dateRange;
  tags.push(`${start.toLocaleDateString('en-GB')} – ${end.toLocaleDateString('en-GB')}`);

  if (variant === 'dashboard') {
    const ctx = context as MetricClickContext;
    if (ctx.filters.country) tags.push(ctx.filters.country);
    if (ctx.filters.product) tags.push(ctx.filters.product);
    if (ctx.filters.source) tags.push(ctx.filters.source);
  } else if (variant === 'marketing') {
    const ctx = context as MarketingMetricClickContext;
    if (ctx.filters.network) tags.push(ctx.filters.network);
    if (ctx.filters.campaign) tags.push(`Campaign: ${ctx.filters.campaign}`);
    if (ctx.filters.adset) tags.push(`Ad Set: ${ctx.filters.adset}`);
    if (ctx.filters.ad) tags.push(`Ad: ${ctx.filters.ad}`);
    if (ctx.filters.date) tags.push(new Date(ctx.filters.date).toLocaleDateString('en-GB'));
  } else {
    const ctx = context as OnPageViewClickContext;
    for (const [dim, value] of Object.entries(ctx.filters.dimensionFilters)) {
      tags.push(`${dim}: ${value}`);
    }
  }

  return tags;
}

async function fetchRecords(
  variant: CrmDetailVariant,
  context: CrmDetailContext,
  pagination: { page: number; pageSize: number }
): Promise<{ records: DetailRecord[]; total: number }> {
  if (variant === 'dashboard') {
    return fetchDashboardDetails(context as MetricClickContext, pagination);
  } else if (variant === 'marketing') {
    return fetchMarketingDetails(context as MarketingMetricClickContext, pagination);
  } else {
    return fetchOnPageCrmDetails(context as OnPageViewClickContext, pagination);
  }
}

/**
 * Unified CRM detail modal used by Dashboard, Marketing Report, and On-Page Analysis.
 * Shows individual subscription/order records with status, customer info, and tracking data.
 */
export function CrmDetailModal({ open, onClose, variant, context }: CrmDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ records: DetailRecord[]; total: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;

  const loadData = useCallback(async () => {
    if (!context) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchRecords(variant, context, {
        page: currentPage,
        pageSize,
      });
      setData({ records: result.records, total: result.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load details');
    } finally {
      setLoading(false);
    }
  }, [variant, context, currentPage]);

  useEffect(() => {
    if (open && context) {
      loadData();
    }
  }, [open, context, currentPage, loadData]);

  useEffect(() => {
    if (open) {
      setCurrentPage(1);
    }
  }, [open, context?.metricId]);

  // Dashboard buy/pay rate shows extra columns
  const isBuyOrPayRate =
    variant === 'dashboard' &&
    ((context as MetricClickContext)?.filters?.rateType === 'buy' ||
     (context as MetricClickContext)?.filters?.rateType === 'pay');

  const exportToCSV = useCallback(async () => {
    if (!context || !data?.total) return;

    setExporting(true);

    try {
      const allData = await fetchRecords(variant, context, {
        page: 1,
        pageSize: Math.min(data.total, 10000),
      });

      const headers =
        variant === 'dashboard'
          ? [
              'Status', 'Customer Name', 'Source',
              'Tracking ID 1', 'Tracking ID 2', 'Tracking ID 3', 'Tracking ID 4', 'Tracking ID 5',
              'Amount', 'Date',
              ...(isBuyOrPayRate ? ['Bought at', 'Paid at'] : []),
            ]
          : [
              'Status', 'Customer Name', 'Source',
              'Campaign ID', 'Ad Set ID', 'Ad ID', 'Product',
              'Amount', 'Date',
            ];

      const csvRows = [
        headers.join(','),
        ...allData.records.map((record) => {
          let status = '';
          if (record.subscriptionStatus === 4) status = 'Soft Cancel';
          else if (record.subscriptionStatus === 5) status = 'Cancel Forever';
          else if (record.isOnHold) status = 'On Hold';
          else if (record.isApproved) status = 'Approved';

          const common = [
            `"${status}"`,
            `"${(record.customerName || '').replace(/"/g, '""')}"`,
            `"${(record.source || '').replace(/"/g, '""')}"`,
          ];

          const variantFields =
            variant === 'dashboard'
              ? [
                  `"${(record.trackingId1 || '').replace(/"/g, '""')}"`,
                  `"${(record.trackingId2 || '').replace(/"/g, '""')}"`,
                  `"${(record.trackingId3 || '').replace(/"/g, '""')}"`,
                  `"${(record.trackingId4 || '').replace(/"/g, '""')}"`,
                  `"${(record.trackingId5 || '').replace(/"/g, '""')}"`,
                ]
              : [
                  `"${(record.trackingId4 || '').replace(/"/g, '""')}"`,
                  `"${(record.trackingId2 || '').replace(/"/g, '""')}"`,
                  `"${(record.trackingId1 || '').replace(/"/g, '""')}"`,
                  `"${(record.productName || '').replace(/"/g, '""')}"`,
                ];

          const tail = [
            record.amount !== null && record.amount !== undefined ? Number(record.amount).toFixed(2) : '0.00',
            new Date(record.date).toLocaleDateString('en-GB'),
            ...(isBuyOrPayRate
              ? [
                  record.dateBought ? new Date(record.dateBought).toLocaleDateString('en-GB') : '',
                  record.datePaid ? new Date(record.datePaid).toLocaleDateString('en-GB') : '',
                ]
              : []),
          ];

          return [...common, ...variantFields, ...tail].join(',');
        }),
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Build filename with metric + date range + all dimensions for clarity
      const metricLabel =
        variant === 'onPage'
          ? ON_PAGE_METRIC_LABELS[context.metricId] || 'crm_details'
          : context.metricLabel || 'details';

      // Add date range (always included)
      const { start, end } = context.filters.dateRange;
      const dateRangeStr = `${start.toLocaleDateString('en-GB').replace(/\//g, '-')}_${end.toLocaleDateString('en-GB').replace(/\//g, '-')}`;

      // Extract dimension values for filename
      const dimensionParts: string[] = [];
      if (variant === 'dashboard') {
        const ctx = context as MetricClickContext;
        if (ctx.filters.country) dimensionParts.push(ctx.filters.country);
        if (ctx.filters.productName) dimensionParts.push(ctx.filters.productName);
        if (ctx.filters.product) dimensionParts.push(ctx.filters.product);
        if (ctx.filters.source) dimensionParts.push(ctx.filters.source);
      } else if (variant === 'marketing') {
        const ctx = context as MarketingMetricClickContext;
        if (ctx.filters.network) dimensionParts.push(ctx.filters.network);
        if (ctx.filters.campaign) dimensionParts.push(ctx.filters.campaign);
        if (ctx.filters.adset) dimensionParts.push(ctx.filters.adset);
        if (ctx.filters.ad) dimensionParts.push(ctx.filters.ad);
        if (ctx.filters.date) dimensionParts.push(ctx.filters.date);
        if (ctx.filters.classifiedProduct) dimensionParts.push(ctx.filters.classifiedProduct);
        if (ctx.filters.classifiedCountry) dimensionParts.push(ctx.filters.classifiedCountry);
      } else {
        const ctx = context as OnPageViewClickContext;
        for (const value of Object.values(ctx.filters.dimensionFilters)) {
          if (value) dimensionParts.push(value);
        }
      }

      // Sanitize parts for filename (remove special chars, limit length)
      const sanitize = (str: string) =>
        str
          .replace(/[^a-zA-Z0-9-_]/g, '-')
          .replace(/-+/g, '-')
          .substring(0, 50);

      const parts = [metricLabel, dateRangeStr, ...dimensionParts.map(sanitize)].filter(Boolean);
      const filename = parts.join('_');

      link.download = `${filename}_export.csv`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [context, data?.total, variant, isBuyOrPayRate]);

  const filterTags = context ? getFilterTags(variant, context) : [];

  const columns: ColumnsType<DetailRecord> = useMemo(() => {
    // --- Status column (shared by all variants) ---
    const statusColumn: ColumnsType<DetailRecord>[number] = {
      title: 'Status',
      key: 'status',
      width: 56,
      align: 'center',
      fixed: 'left',
      render: (_: unknown, record: DetailRecord) => {
        if (record.subscriptionStatus === 4 || record.subscriptionStatus === 5) {
          return (
            <Tooltip
              title={
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {record.subscriptionStatus === 4 ? 'Soft Cancel' : 'Cancel Forever'}
                  </div>
                  {record.cancelReason && <div style={{ marginTop: 4 }}>{record.cancelReason}</div>}
                  {record.cancelReasonAbout && <div style={{ marginTop: 2, opacity: 0.85 }}>{record.cancelReasonAbout}</div>}
                </div>
              }
            >
              <span className={styles.badgeCancelled}>✕</span>
            </Tooltip>
          );
        }
        if (record.isOnHold) {
          return (
            <Tooltip title="On Hold">
              <span className={styles.badgeOnHold}>●</span>
            </Tooltip>
          );
        }
        if (record.isApproved) {
          return (
            <Tooltip title="Approved">
              <span className={styles.badgeApproved}>✓</span>
            </Tooltip>
          );
        }
        return null;
      },
    };

    // --- Customer column (shared by all variants) ---
    const customerColumn: ColumnsType<DetailRecord>[number] = {
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
        </div>
      ),
    };

    // --- Shared cell renderers ---
    const monoRender = (val: string | null) => (
      <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>
    );
    const sourceRender = (val: string | null) => (
      <Tooltip title={val || '–'}><span className={styles.sourceCell}>{val || '–'}</span></Tooltip>
    );

    const cols: ColumnsType<DetailRecord> = [statusColumn, customerColumn];

    // Source (all variants)
    cols.push({
      title: 'Source',
      dataIndex: 'source',
      width: 100,
      ellipsis: { showTitle: false },
      render: (val) => <Tooltip title={val}><span className={styles.sourceCell}>{val}</span></Tooltip>,
    });

    if (variant === 'dashboard') {
      // Tracking 1-5
      for (let i = 1; i <= 5; i++) {
        cols.push({
          title: `Tracking ${i}`,
          dataIndex: `trackingId${i}`,
          width: 110,
          ellipsis: { showTitle: false },
          render: monoRender,
        });
      }
    } else {
      // Campaign ID, Ad Set ID, Ad ID, Product
      cols.push(
        { title: 'Campaign ID', dataIndex: 'trackingId4', width: 120, ellipsis: { showTitle: false }, render: monoRender },
        { title: 'Ad Set ID', dataIndex: 'trackingId2', width: 120, ellipsis: { showTitle: false }, render: monoRender },
        { title: 'Ad ID', dataIndex: 'trackingId1', width: 120, ellipsis: { showTitle: false }, render: monoRender },
        { title: 'Product', dataIndex: 'productName', width: 150, ellipsis: { showTitle: false }, render: sourceRender },
      );
    }

    // Amount
    cols.push({
      title: 'Amount',
      dataIndex: 'amount',
      width: 90,
      align: 'right',
      render: (val) => {
        const formatted = val !== null && val !== undefined ? Number(val).toFixed(2) : '0.00';
        return <span className={styles.amountCell}>{formatted}</span>;
      },
    });

    // Date
    cols.push({
      title: 'Date',
      dataIndex: 'date',
      width: 90,
      render: (val) => (
        <span className={styles.dateCell}>
          {new Date(val).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
        </span>
      ),
    });

    // Buy/pay rate extra columns
    if (isBuyOrPayRate) {
      cols.push(
        {
          title: 'Bought at',
          dataIndex: 'dateBought',
          width: 90,
          render: (val) => (
            <span className={styles.dateCell}>
              {val ? new Date(val).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '–'}
            </span>
          ),
        },
        {
          title: 'Paid at',
          dataIndex: 'datePaid',
          width: 90,
          render: (val) => (
            <span className={styles.dateCell}>
              {val ? new Date(val).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '–'}
            </span>
          ),
        }
      );
    }

    return cols;
  }, [variant, isBuyOrPayRate]);

  // Scroll width: status(56) + customer(190) + source(100) + variant columns + amount(90) + date(90)
  const scrollX = useMemo(() => {
    const base = 56 + 190 + 100 + 90 + 90; // 526
    if (variant === 'dashboard') {
      // 5 × tracking(110) = 550
      const extra = isBuyOrPayRate ? 180 : 0; // bought(90) + paid(90)
      return base + 550 + extra;
    }
    // campaign(120) + adset(120) + ad(120) + product(150) = 510
    return base + 510;
  }, [variant, isBuyOrPayRate]);

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
            {getTitle(variant, context)}
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
        {loading && !data ? (
          <TableSkeleton
            rows={10}
            columns={columns.length}
            columnWidths={columns.map(col => typeof col.width === 'number' ? col.width : 150)}
          />
        ) : (
          <Table
            columns={columns}
            dataSource={data?.records || []}
            loading={false}
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
            scroll={{ x: scrollX }}
            size="small"
          />
        )}
      </div>
    </Modal>
  );
}
