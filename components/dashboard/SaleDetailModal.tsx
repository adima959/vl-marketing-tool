'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal, Table, Tooltip, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { SaleRow } from '@/types/sales';
import type { MetricClickContext } from '@/types/table';
import type { ClickableMetricId } from '@/lib/utils/saleRowFilters';
import { filterSalesForMetric } from '@/lib/utils/saleRowFilters';
import { useDashboardStore } from '@/stores/dashboardStore';
import { downloadCsv } from '@/lib/utils/csvExport';
import { formatNumber } from '@/lib/formatters';
import { TableSkeleton } from '@/components/loading/TableSkeleton';
import styles from './SaleDetailModal.module.css';

const PAGE_SIZE = 100;
const CRM_BASE_URL = 'https://vitaliv.no/admin/customers';

interface SaleDetailModalProps {
  open: boolean;
  onClose: () => void;
  context: MetricClickContext | null;
  /** Pre-loaded sales data. If omitted, reads from dashboard store. */
  salesData?: SaleRow[];
}

// ── Filter tags ──────────────────────────────────────────────

function buildFilterTags(context: MetricClickContext): string[] {
  const tags: string[] = [];
  const { start, end } = context.filters.dateRange;
  tags.push(`${start.toLocaleDateString('en-GB')} – ${end.toLocaleDateString('en-GB')}`);

  for (const value of Object.values(context.filters.dimensionFilters)) {
    if (value) tags.push(value);
  }
  return tags;
}

// ── Status badge ─────────────────────────────────────────────

function renderStatusBadge(record: SaleRow): React.ReactNode {
  if (record.status === 'cancel_soft' || record.status === 'cancel_forever') {
    const label = record.status === 'cancel_soft' ? 'Soft Cancel' : 'Cancel Forever';
    return (
      <Tooltip
        title={
          <div>
            <div style={{ fontWeight: 600 }}>{label}</div>
            {record.cancel_reason && <div style={{ marginTop: 4 }}>{record.cancel_reason}</div>}
          </div>
        }
      >
        <span className={styles.badgeCancelled}>✕</span>
      </Tooltip>
    );
  }
  if (record.is_on_hold) return <Tooltip title="On Hold"><span className={styles.badgeOnHold}>●</span></Tooltip>;
  if (record.is_approved) return <Tooltip title="Approved"><span className={styles.badgeApproved}>✓</span></Tooltip>;
  return null;
}

// ── Type badge ───────────────────────────────────────────────

function renderTypeBadge(type: SaleRow['type']): React.ReactNode {
  const map: Record<SaleRow['type'], { label: string; className: string }> = {
    subscription: { label: 'SUB', className: styles.typeSub },
    ots: { label: 'OTS', className: styles.typeOts },
    upsell: { label: 'UPSELL', className: styles.typeUpsell },
  };
  const { label, className } = map[type];
  return <span className={`${styles.typeBadge} ${className}`}>{label}</span>;
}

// ── Column definitions ───────────────────────────────────────

function buildColumns(): ColumnsType<SaleRow> {
  const monoRender = (val: string | null) => (
    <Tooltip title={val || '–'}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>
  );

  return [
    {
      title: 'Date',
      dataIndex: 'date',
      width: 100,
      fixed: 'left',
      render: (val: string) => {
        const d = new Date(val);
        return <span className={styles.dateCell}>{d.toLocaleDateString('en-GB')}</span>;
      },
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 70,
      align: 'center',
      fixed: 'left',
      render: (type: SaleRow['type']) => renderTypeBadge(type),
    },
    {
      title: 'Status',
      key: 'status',
      width: 56,
      align: 'center',
      fixed: 'left',
      render: (_: unknown, record: SaleRow) => renderStatusBadge(record),
    },
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      width: 190,
      fixed: 'left',
      ellipsis: { showTitle: false },
      render: (name: string, record: SaleRow) => (
        <div className={styles.customerCell}>
          <span className={styles.customerNameWrap}>
            <Tooltip title={name} placement="topLeft">
              <a
                href={`${CRM_BASE_URL}/${encodeURIComponent(record.customer_id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.customerLink}
              >
                {name}
              </a>
            </Tooltip>
          </span>
          {record.is_new_customer && <span className={styles.badgeNew}>NEW</span>}
        </div>
      ),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      width: 100,
      ellipsis: { showTitle: false },
      render: (val: string) => (
        <Tooltip title={val}><span className={styles.sourceCell}>{val}</span></Tooltip>
      ),
    },
    { title: 'Tracking 1', dataIndex: 'tracking_id', width: 110, ellipsis: { showTitle: false }, render: monoRender },
    { title: 'Tracking 2', dataIndex: 'tracking_id_2', width: 110, ellipsis: { showTitle: false }, render: monoRender },
    { title: 'Tracking 3', dataIndex: 'tracking_id_3', width: 110, ellipsis: { showTitle: false }, render: monoRender },
    { title: 'Tracking 4', dataIndex: 'tracking_id_4', width: 110, ellipsis: { showTitle: false }, render: monoRender },
    { title: 'Tracking 5', dataIndex: 'tracking_id_5', width: 110, ellipsis: { showTitle: false }, render: monoRender },
    {
      title: 'Amount',
      dataIndex: 'total',
      width: 90,
      align: 'right',
      render: (val: number) => (
        <span className={styles.amountCell}>
          {val !== null && val !== undefined ? Number(val).toFixed(2) : '0.00'}
        </span>
      ),
    },
  ];
}

// ── CSV export ───────────────────────────────────────────────

const CSV_HEADERS = [
  'Date', 'Type', 'Status', 'Customer ID', 'Customer Name', 'New Customer',
  'Country', 'Product Group', 'Product', 'SKU', 'Source',
  'Tracking 1', 'Tracking 2', 'Tracking 3', 'Tracking 4', 'Tracking 5',
  'Amount',
];

function saleRowToCsvRow(r: SaleRow): string {
  const status = r.status === 'cancelled' ? 'Cancelled' : r.is_on_hold ? 'On Hold' : r.is_approved ? 'Approved' : '';
  const fields = [
    r.date,
    r.type,
    status,
    String(r.customer_id),
    `"${(r.customer_name || '').replace(/"/g, '""')}"`,
    r.is_new_customer ? 'Yes' : 'No',
    r.country,
    r.product_group,
    r.product,
    r.sku,
    r.source,
    r.tracking_id || '',
    r.tracking_id_2 || '',
    r.tracking_id_3 || '',
    r.tracking_id_4 || '',
    r.tracking_id_5 || '',
    Number(r.total).toFixed(2),
  ];
  return fields.join(',');
}

function exportToCsv(rows: SaleRow[], metricLabel: string): void {
  const csvRows = [CSV_HEADERS.join(','), ...rows.map(saleRowToCsvRow)];
  const filename = `${metricLabel.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCsv(csvRows, filename);
}

// ── Component ────────────────────────────────────────────────

export function SaleDetailModal({ open, onClose, context, salesData: salesDataProp }: SaleDetailModalProps) {
  const dashboardSales = useDashboardStore((s) => s.salesData);
  const salesData = salesDataProp ?? dashboardSales;
  const [currentPage, setCurrentPage] = useState(1);
  const [filteredData, setFilteredData] = useState<SaleRow[]>([]);
  const [resolvedKey, setResolvedKey] = useState('');

  // Key derived synchronously from props — changes instantly on click
  const contextKey = open && context
    ? `${context.metricId}::${JSON.stringify(context.filters.dimensionFilters)}`
    : '';

  // Defer filtering so the modal paints immediately with a skeleton
  useEffect(() => {
    if (!open || !context || salesData.length === 0) {
      setFilteredData([]);
      setResolvedKey('');
      return;
    }
    setCurrentPage(1);
    const frameId = requestAnimationFrame(() => {
      const result = filterSalesForMetric(
        salesData,
        context.filters.dimensionFilters,
        context.metricId as ClickableMetricId,
      );
      setFilteredData(result);
      setResolvedKey(`${context.metricId}::${JSON.stringify(context.filters.dimensionFilters)}`);
    });
    return () => cancelAnimationFrame(frameId);
  }, [open, salesData, context]);

  const columns = useMemo(() => buildColumns(), []);
  const filterTags = useMemo(() => context ? buildFilterTags(context) : [], [context]);
  const totalWidth = columns.reduce((sum, col) => sum + (Number(col.width) || 100), 0);

  // Skeleton shows when the requested context doesn't match the resolved data yet
  const showSkeleton = open && contextKey !== resolvedKey;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1200}
      centered
      destroyOnHidden
      className={styles.modal}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>{context?.metricLabel || 'Details'}</span>
          {!showSkeleton && (
            <span className={styles.recordCount}>
              {formatNumber(filteredData.length)} record{filteredData.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => exportToCsv(filteredData, context?.metricLabel || 'export')}
            disabled={filteredData.length === 0 || showSkeleton}
          >
            CSV
          </Button>
        </div>
      </div>

      {/* Filter tags */}
      {filterTags.length > 0 && (
        <div className={styles.filterBar}>
          {filterTags.map((tag) => (
            <span key={tag} className={styles.filterTag}>{tag}</span>
          ))}
        </div>
      )}

      {/* Table or skeleton */}
      {showSkeleton ? (
        <div style={{ padding: '8px 0' }}>
          <TableSkeleton rows={8} columns={6} columnWidths={[100, 70, 56, 190, 100, 110]} />
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <Table<SaleRow>
            columns={columns}
            dataSource={filteredData}
            rowKey={(r) => `${r.type}-${r.id}`}
            pagination={{
              current: currentPage,
              pageSize: PAGE_SIZE,
              total: filteredData.length,
              showSizeChanger: false,
              showTotal: (total, range) => `${range[0]}–${range[1]} of ${formatNumber(total)}`,
              onChange: (page) => setCurrentPage(page),
            }}
            size="small"
            scroll={{ x: totalWidth }}
          />
        </div>
      )}
    </Modal>
  );
}
