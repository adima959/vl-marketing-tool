'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Table, Tooltip, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { OnPageViewClickContext, OnPageDetailRecord } from '@/types/onPageDetails';
import { fetchOnPageDetails } from '@/lib/api/onPageDetailsClient';
import { getOnPageDimensionLabel } from '@/config/onPageDimensions';
import modalStyles from '@/styles/components/modal.module.css';
import styles from './OnPageViewsModal.module.css';

interface OnPageViewsModalProps {
  open: boolean;
  onClose: () => void;
  context: OnPageViewClickContext | null;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '–';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export function OnPageViewsModal({ open, onClose, context }: OnPageViewsModalProps) {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ records: OnPageDetailRecord[]; total: number } | null>(null);
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
      const result = await fetchOnPageDetails(
        context,
        { page: currentPage, pageSize }
      );
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
    setExportProgress({ current: 0, total: 0 });

    try {
      // Fetch all data in batches of 1000 (increased from 500)
      const batchSize = 1000;
      const totalPages = Math.ceil(data.total / batchSize);
      const allRecords: OnPageDetailRecord[] = [];

      setExportProgress({ current: 0, total: totalPages });

      for (let page = 1; page <= totalPages; page++) {
        const batchData = await fetchOnPageDetails(
          context,
          { page, pageSize: batchSize }
        );
        allRecords.push(...batchData.records);
        setExportProgress({ current: page, total: totalPages });
      }

      const headers = [
        // Session/Identity
        'Timestamp', 'Visitor ID', 'Session ID', 'Visit #',
        // Page/URL
        'Type', 'URL Path', 'Full URL',
        // Traffic Source
        'Source', 'Campaign', 'Adset', 'Ad', 'UTM Term', 'Keyword', 'Placement', 'Referrer',
        // Device/Environment
        'Device', 'OS', 'OS Version', 'Browser', 'Platform', 'Language', 'User Agent', 'Country',
        // Engagement
        'Active Time (s)', 'Scroll %', 'Hero Scroll', 'Form View', 'Form Started', 'Form Errors', 'CTA View', 'CTA Click',
        // Performance
        'FCP (s)', 'LCP (s)', 'TTI (s)',
      ];

      const csvRows = [
        headers.join(','),
        ...allRecords.map((r: OnPageDetailRecord) => [
          // Session/Identity
          `"${new Date(r.createdAt).toLocaleString('en-GB')}"`,
          `"${r.ffVisitorId}"`,
          `"${r.sessionId || ''}"`,
          r.visitNumber ?? '',
          // Page/URL
          `"${r.pageType || 'unknown'}"`,
          `"${(r.urlPath || '').replace(/"/g, '""')}"`,
          `"${(r.urlFull || '').replace(/"/g, '""')}"`,
          // Traffic Source
          `"${(r.utmSource || '').replace(/"/g, '""')}"`,
          `"${(r.utmCampaign || '').replace(/"/g, '""')}"`,
          `"${(r.utmContent || '').replace(/"/g, '""')}"`,
          `"${(r.utmMedium || '').replace(/"/g, '""')}"`,
          `"${(r.utmTerm || '').replace(/"/g, '""')}"`,
          `"${(r.keyword || '').replace(/"/g, '""')}"`,
          `"${(r.placement || '').replace(/"/g, '""')}"`,
          `"${(r.referrer || '').replace(/"/g, '""')}"`,
          // Device/Environment
          `"${r.deviceType || ''}"`,
          `"${r.osName || ''}"`,
          `"${r.osVersion || ''}"`,
          `"${r.browserName || ''}"`,
          `"${r.platform || ''}"`,
          `"${r.language || ''}"`,
          `"${(r.userAgent || '').replace(/"/g, '""')}"`,
          `"${r.countryCode || ''}"`,
          // Engagement
          r.activeTimeS != null ? r.activeTimeS.toFixed(1) : '',
          r.scrollPercent ?? '',
          r.heroScrollPassed ? 'Yes' : 'No',
          r.formView ? 'Yes' : 'No',
          r.formStarted ? 'Yes' : 'No',
          r.formErrors || 0,
          r.ctaViewed ? 'Yes' : 'No',
          r.ctaClicked ? 'Yes' : 'No',
          // Performance
          r.fcpS != null ? r.fcpS.toFixed(2) : '',
          r.lcpS != null ? r.lcpS.toFixed(2) : '',
          r.ttiS != null ? r.ttiS.toFixed(2) : '',
        ].join(',')),
      ];

      // Build descriptive filename from filters
      const { start, end } = context.filters.dateRange;
      const dateStr = start.toISOString().split('T')[0];
      const endDateStr = end.toISOString().split('T')[0];
      const dateRangeStr = dateStr === endDateStr ? dateStr : `${dateStr}_${endDateStr}`;

      // Add dimension filter values to filename
      const filterParts: string[] = [];
      for (const [dimId, value] of Object.entries(context.filters.dimensionFilters)) {
        // Sanitize value for filename (remove special chars, limit length)
        const sanitized = value.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 20);
        filterParts.push(sanitized);
      }

      const filterSuffix = filterParts.length > 0 ? `_${filterParts.join('_')}` : '';
      const filename = `page_views_${dateRangeStr}${filterSuffix}.csv`;

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [context, data?.total]);

  // Build filter tags from dimension filters
  const filterTags: string[] = useMemo(() => {
    if (!context) return [];
    const tags: string[] = [];
    const { start, end } = context.filters.dateRange;
    tags.push(`${start.toLocaleDateString('en-GB')} – ${end.toLocaleDateString('en-GB')}`);
    for (const [dimId, value] of Object.entries(context.filters.dimensionFilters)) {
      tags.push(`${getOnPageDimensionLabel(dimId)}: ${value}`);
    }
    return tags;
  }, [context]);

  // Track first occurrence of each visitor for the "Unique" badge
  const repeatRowIds = useMemo(() => {
    if (!data?.records) return new Set<string>();
    const seen = new Set<string>();
    const repeats = new Set<string>();
    for (const r of data.records) {
      if (seen.has(r.ffVisitorId)) {
        repeats.add(r.id);
      } else {
        seen.add(r.ffVisitorId);
      }
    }
    return repeats;
  }, [data?.records]);

  const columns: ColumnsType<OnPageDetailRecord> = useMemo(() => [
    // ========== 1. SESSION/IDENTITY ==========
    {
      title: 'Timestamp',
      dataIndex: 'createdAt',
      width: 140,
      fixed: 'left',
      render: (val: string) => (
        <span className={styles.dateCell}>
          {new Date(val).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      title: 'Visitor ID',
      dataIndex: 'ffVisitorId',
      width: 120,
      ellipsis: { showTitle: false },
      render: (val: string) => (
        <Tooltip title={val}>
          <span className={styles.monoCell}>{val?.slice(0, 10)}…</span>
        </Tooltip>
      ),
    },
    {
      title: 'Session ID',
      dataIndex: 'sessionId',
      width: 120,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}>
          <span className={styles.monoCell}>{val ? `${val.slice(0, 10)}…` : '–'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Unique',
      dataIndex: 'id',
      width: 50,
      align: 'center',
      render: (_: string, record: OnPageDetailRecord) =>
        !repeatRowIds.has(record.id) ? (
          <span className={styles.uniqueBadge}>1st</span>
        ) : null,
    },
    {
      title: 'Visit #',
      dataIndex: 'visitNumber',
      width: 70,
      align: 'center',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val ?? '–'}</span>
      ),
    },

    // ========== 2. PAGE/URL ==========
    {
      title: 'Type',
      dataIndex: 'pageType',
      width: 90,
      render: (val: string | null) => (
        <span style={{ fontSize: 12 }}>{val || 'unknown'}</span>
      ),
    },
    {
      title: 'URL Path',
      dataIndex: 'urlPath',
      width: 220,
      ellipsis: { showTitle: false },
      render: (val: string) => {
        return (
          <Tooltip title={val}>
            <div className={styles.urlCell}>
              {val ? (
                <a href={val} target="_blank" rel="noopener noreferrer" className={styles.urlLink}>
                  {val}
                </a>
              ) : '–'}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Full URL',
      dataIndex: 'urlFull',
      width: 300,
      ellipsis: { showTitle: false },
      render: (val: string | null, record: OnPageDetailRecord) => {
        const href = val || record.urlPath || '';
        const display = val || record.urlPath || '–';
        return (
          <div className={styles.urlCell}>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className={styles.urlLink}>
                {display}
              </a>
            ) : display}
          </div>
        );
      },
    },

    // ========== 3. TRAFFIC SOURCE ==========
    {
      title: 'Source',
      dataIndex: 'utmSource',
      width: 90,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '–'}</span></Tooltip>
      ),
    },
    {
      title: 'Campaign',
      dataIndex: 'utmCampaign',
      width: 130,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>
      ),
    },
    {
      title: 'Adset',
      dataIndex: 'utmContent',
      width: 130,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>
      ),
    },
    {
      title: 'Ad',
      dataIndex: 'utmMedium',
      width: 130,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span className={styles.monoCell}>{val || '–'}</span></Tooltip>
      ),
    },
    {
      title: 'UTM Term',
      dataIndex: 'utmTerm',
      width: 100,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '–'}</span></Tooltip>
      ),
    },
    {
      title: 'Keyword',
      dataIndex: 'keyword',
      width: 120,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '–'}</span></Tooltip>
      ),
    },
    {
      title: 'Placement',
      dataIndex: 'placement',
      width: 150,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '–'}</span></Tooltip>
      ),
    },
    {
      title: 'Referrer',
      dataIndex: 'referrer',
      width: 200,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}>
          <div className={styles.urlCell}>
            {val ? (
              <a href={val} target="_blank" rel="noopener noreferrer" className={styles.urlLink}>
                {val}
              </a>
            ) : '–'}
          </div>
        </Tooltip>
      ),
    },

    // ========== 4. DEVICE/ENVIRONMENT ==========
    {
      title: 'Device',
      dataIndex: 'deviceType',
      width: 80,
      render: (val: string | null) => (
        <span style={{ fontSize: 12 }}>{val || '–'}</span>
      ),
    },
    {
      title: 'OS',
      dataIndex: 'osName',
      width: 70,
      render: (val: string | null) => (
        <span style={{ fontSize: 12 }}>{val || '–'}</span>
      ),
    },
    {
      title: 'OS Ver',
      dataIndex: 'osVersion',
      width: 80,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '–'}</span></Tooltip>
      ),
    },
    {
      title: 'Browser',
      dataIndex: 'browserName',
      width: 80,
      render: (val: string | null) => (
        <span style={{ fontSize: 12 }}>{val || '–'}</span>
      ),
    },
    {
      title: 'Platform',
      dataIndex: 'platform',
      width: 100,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '–'}</span></Tooltip>
      ),
    },
    {
      title: 'Language',
      dataIndex: 'language',
      width: 80,
      align: 'center',
      render: (val: string | null) => (
        <span className={styles.monoCell}>{val || '–'}</span>
      ),
    },
    {
      title: 'User Agent',
      dataIndex: 'userAgent',
      width: 200,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 11 }}>{val || '–'}</span></Tooltip>
      ),
    },
    {
      title: 'Country',
      dataIndex: 'countryCode',
      width: 70,
      align: 'center',
      render: (val: string | null) => (
        <span className={styles.monoCell}>{val || '–'}</span>
      ),
    },

    // ========== 5. ENGAGEMENT ==========
    {
      title: 'Active Time',
      dataIndex: 'activeTimeS',
      width: 100,
      align: 'right',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{formatDuration(val)}</span>
      ),
    },
    {
      title: 'Scroll %',
      dataIndex: 'scrollPercent',
      width: 80,
      align: 'right',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val != null ? `${val}%` : '–'}</span>
      ),
    },
    {
      title: 'Hero',
      dataIndex: 'heroScrollPassed',
      width: 60,
      align: 'center',
      render: (val: boolean) => (
        <span className={val ? styles.boolTrue : styles.boolFalse}>
          {val ? '✓' : '–'}
        </span>
      ),
    },
    {
      title: 'Form View',
      dataIndex: 'formView',
      width: 80,
      align: 'center',
      render: (val: boolean) => (
        <span className={val ? styles.boolTrue : styles.boolFalse}>
          {val ? '✓' : '–'}
        </span>
      ),
    },
    {
      title: 'Form Start',
      dataIndex: 'formStarted',
      width: 80,
      align: 'center',
      render: (val: boolean) => (
        <span className={val ? styles.boolTrue : styles.boolFalse}>
          {val ? '✓' : '–'}
        </span>
      ),
    },
    {
      title: 'Form Err',
      dataIndex: 'formErrors',
      width: 50,
      align: 'center',
      render: (val: number) => (
        <span className={val > 0 ? styles.boolTrue : styles.boolFalse}>
          {val > 0 ? val : '–'}
        </span>
      ),
    },
    {
      title: 'CTA View',
      dataIndex: 'ctaViewed',
      width: 80,
      align: 'center',
      render: (val: boolean) => (
        <span className={val ? styles.boolTrue : styles.boolFalse}>
          {val ? '✓' : '–'}
        </span>
      ),
    },
    {
      title: 'CTA Click',
      dataIndex: 'ctaClicked',
      width: 80,
      align: 'center',
      render: (val: boolean) => (
        <span className={val ? styles.boolTrue : styles.boolFalse}>
          {val ? '✓' : '–'}
        </span>
      ),
    },

    // ========== 6. PERFORMANCE ==========
    {
      title: 'FCP',
      dataIndex: 'fcpS',
      width: 60,
      align: 'right',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val != null ? `${val.toFixed(1)}s` : '–'}</span>
      ),
    },
    {
      title: 'LCP',
      dataIndex: 'lcpS',
      width: 60,
      align: 'right',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val != null ? `${val.toFixed(1)}s` : '–'}</span>
      ),
    },
    {
      title: 'TTI',
      dataIndex: 'ttiS',
      width: 60,
      align: 'right',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val != null ? `${val.toFixed(1)}s` : '–'}</span>
      ),
    },
  ], [repeatRowIds]);

  return (
    <Modal
      title="Page Views"
      open={open}
      onCancel={onClose}
      width="95vw"
      centered
      footer={null}
      className={`${modalStyles.modal} ${styles.modal}`}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>
            {context?.metricLabel || 'Page Views'}
          </span>
          <span className={styles.recordCount}>
            {data?.total ?? context?.value ?? 0} records
          </span>
        </div>
        <div className={styles.headerRight}>
          {exportProgress && (
            <div className={styles.exportProgress}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                />
              </div>
              <span className={styles.progressText}>
                Exporting... {exportProgress.current} of {exportProgress.total}
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
            className={styles.exportButton}
          >
            {exporting ? 'Exporting...' : 'Export'}
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

      {error && <div className={styles.error}>{error}</div>}

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
          scroll={{ x: 3710 }}
          size="small"
        />
      </div>
    </Modal>
  );
}
