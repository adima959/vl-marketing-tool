'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal, Table, Tooltip, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MetricClickContext, DetailRecord } from '@/types/dashboardDetails';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import type { OnPageViewClickContext } from '@/types/onPageDetails';
import { fetchDashboardDetails } from '@/lib/api/dashboardDetailsClient';
import { fetchMarketingDetails } from '@/lib/api/marketingDetailsClient';
import { fetchOnPageCrmDetails } from '@/lib/api/onPageCrmDetailsClient';
import { fetchAllRecords, downloadCsv, ExportCancelledError } from '@/lib/utils/csvExport';
import { buildCrmExportHeaders, buildCrmExportRow, buildCrmExportFilename, ON_PAGE_METRIC_LABELS } from '@/lib/utils/crmDetailExport';
import { TableSkeleton } from '@/components/loading/TableSkeleton';
import modalStyles from '@/styles/components/modal.module.css';
import stickyStyles from '@/styles/tables/sticky.module.css';
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

// ============================================================================
// Column builder — extracted to reduce component CC
// ============================================================================

/** Render subscription status badge (cancelled, on hold, approved, or null) */
function renderStatusBadge(record: DetailRecord): React.ReactNode {
  if (record.subscriptionStatus === 4 || record.subscriptionStatus === 5) {
    return (
      <Tooltip
        title={
          <div>
            <div style={{ fontWeight: 600 }}>{record.subscriptionStatus === 4 ? 'Soft Cancel' : 'Cancel Forever'}</div>
            {record.cancelReason && <div style={{ marginTop: 4 }}>{record.cancelReason}</div>}
            {record.cancelReasonAbout && <div style={{ marginTop: 2, opacity: 0.85 }}>{record.cancelReasonAbout}</div>}
          </div>
        }
      >
        <span className={styles.badgeCancelled}>✕</span>
      </Tooltip>
    );
  }
  if (record.isOnHold) return <Tooltip title="On Hold"><span className={styles.badgeOnHold}>●</span></Tooltip>;
  if (record.isApproved) return <Tooltip title="Approved"><span className={styles.badgeApproved}>✓</span></Tooltip>;
  return null;
}

function buildCrmDetailColumns(
  variant: CrmDetailVariant,
  isBuyOrPayRate: boolean
): ColumnsType<DetailRecord> {
  // --- Shared cell renderers ---
  const monoRender = (val: string | null) => (
    <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>
  );
  const sourceRender = (val: string | null) => (
    <Tooltip title={val || '–'}><span className={styles.sourceCell}>{val || '–'}</span></Tooltip>
  );
  const renderDateTime = (val: string | null) => {
    if (!val) return <span className={styles.dateCell}>–</span>;
    const d = new Date(val);
    const date = d.toLocaleDateString('en-GB');
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return <span className={styles.dateCell}>{date} - {time}</span>;
  };

  // --- Fixed-left columns ---
  const cols: ColumnsType<DetailRecord> = [
    {
      title: 'Date', dataIndex: 'date', width: 130, fixed: 'left',
      render: (val) => {
        const d = new Date(val);
        return <span className={styles.dateCell}>{d.toLocaleDateString('en-GB')} - {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>;
      },
    },
    {
      title: 'Status', key: 'status', width: 56, align: 'center', fixed: 'left',
      render: (_: unknown, record: DetailRecord) => renderStatusBadge(record),
    },
    {
      title: 'Customer', dataIndex: 'customerName', width: 190, fixed: 'left', ellipsis: { showTitle: false },
      render: (name: string, record: DetailRecord) => (
        <div className={styles.customerCell}>
          <span className={styles.customerNameWrap}>
            <Tooltip title={name} placement="topLeft">
              <a href={`https://vitaliv.no/admin/customers/${encodeURIComponent(record.customerId)}`} target="_blank" rel="noopener noreferrer" className={styles.customerLink}>{name}</a>
            </Tooltip>
          </span>
          {record.customerDateRegistered && new Date(record.customerDateRegistered).toDateString() === new Date(record.date).toDateString() && (
            <span className={styles.badgeNew}>NEW</span>
          )}
        </div>
      ),
    },
  ];

  // --- Source (all variants) ---
  cols.push({
    title: 'Source', dataIndex: 'source', width: 100, ellipsis: { showTitle: false },
    render: (val) => <Tooltip title={val}><span className={styles.sourceCell}>{val}</span></Tooltip>,
  });

  // --- Variant-specific tracking columns ---
  if (variant === 'dashboard') {
    for (let i = 1; i <= 5; i++) {
      cols.push({ title: `Tracking ${i}`, dataIndex: `trackingId${i}`, width: 110, ellipsis: { showTitle: false }, render: monoRender });
    }
  } else {
    cols.push(
      { title: 'Campaign ID', dataIndex: 'trackingId4', width: 120, ellipsis: { showTitle: false }, render: monoRender },
      { title: 'Ad Set ID', dataIndex: 'trackingId2', width: 120, ellipsis: { showTitle: false }, render: monoRender },
      { title: 'Ad ID', dataIndex: 'trackingId1', width: 120, ellipsis: { showTitle: false }, render: monoRender },
      { title: 'Product', dataIndex: 'productName', width: 150, ellipsis: { showTitle: false }, render: sourceRender },
    );
  }

  // --- Amount ---
  cols.push({
    title: 'Amount', dataIndex: 'amount', width: 90, align: 'right',
    render: (val) => <span className={styles.amountCell}>{val !== null && val !== undefined ? Number(val).toFixed(2) : '0.00'}</span>,
  });

  // --- Buy/pay rate extra columns ---
  if (isBuyOrPayRate) {
    cols.push(
      { title: 'Bought at', dataIndex: 'dateBought', width: 130, render: renderDateTime },
      { title: 'Paid at', dataIndex: 'datePaid', width: 130, render: renderDateTime },
    );
  }

  return cols;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Unified CRM detail modal used by Dashboard, Marketing Report, and On-Page Analysis.
 * Shows individual subscription/order records with status, customer info, and tracking data.
 */
export function CrmDetailModal({ open, onClose, variant, context }: CrmDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ records: DetailRecord[]; total: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;
  const exportAbortRef = useRef<AbortController | null>(null);

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
    } else {
      exportAbortRef.current?.abort();
    }
  }, [open, context?.metricId]);

  // Dashboard buy/pay rate shows extra columns
  const isBuyOrPayRate =
    variant === 'dashboard' &&
    ((context as MetricClickContext)?.filters?.rateType === 'buy' ||
     (context as MetricClickContext)?.filters?.rateType === 'pay');

  const cancelExport = useCallback(() => {
    exportAbortRef.current?.abort();
  }, []);

  const exportToCSV = useCallback(async () => {
    if (!context || !data?.total) return;

    const abortController = new AbortController();
    exportAbortRef.current = abortController;
    setExporting(true);
    setExportProgress({ current: 0, total: Math.min(data.total, 100_000) });

    try {
      const allRecords = await fetchAllRecords<DetailRecord>(
        (pagination) => fetchRecords(variant, context, pagination),
        data.total,
        (fetched, total) => setExportProgress({ current: fetched, total }),
        abortController.signal,
      );

      const headers = buildCrmExportHeaders(variant, isBuyOrPayRate);
      const csvRows = [
        headers.join(','),
        ...allRecords.map((record) => buildCrmExportRow(record, variant, isBuyOrPayRate)),
      ];
      const filename = buildCrmExportFilename(variant, context, isBuyOrPayRate);

      downloadCsv(csvRows, filename);
    } catch (err) {
      if (!(err instanceof ExportCancelledError)) {
        console.error('Export failed:', err);
      }
    } finally {
      setExporting(false);
      setExportProgress(null);
      exportAbortRef.current = null;
    }
  }, [context, data?.total, variant, isBuyOrPayRate]);

  const filterTags = context ? getFilterTags(variant, context) : [];

  const columns: ColumnsType<DetailRecord> = useMemo(
    () => buildCrmDetailColumns(variant, isBuyOrPayRate),
    [variant, isBuyOrPayRate]
  );

  // Scroll width: status(56) + date(130) + customer(190) + source(100) + variant columns + amount(90)
  const scrollX = useMemo(() => {
    const base = 56 + 190 + 100 + 90 + 130; // 566
    if (variant === 'dashboard') {
      // 5 × tracking(110) = 550
      const extra = isBuyOrPayRate ? 260 : 0; // bought(130) + paid(130)
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
          {exportProgress && (
            <div className={modalStyles.exportProgress}>
              <div className={modalStyles.progressBar}>
                <div
                  className={modalStyles.progressFill}
                  style={{ width: `${(exportProgress.current / Math.max(exportProgress.total, 1)) * 100}%` }}
                />
              </div>
              <span className={modalStyles.progressText}>
                {exportProgress.current.toLocaleString()} / {exportProgress.total.toLocaleString()} records
                {' · '}
                <button type="button" className={modalStyles.cancelExport} onClick={cancelExport}>Cancel</button>
              </span>
            </div>
          )}
          <Button
            type="text"
            size="small"
            icon={!exporting ? <DownloadOutlined /> : undefined}
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

      <div className={`${styles.tableWrap} ${stickyStyles.stickyTable}`}>
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
            sticky={{ offsetHeader: 0 }}
            size="small"
          />
        )}
      </div>
    </Modal>
  );
}
