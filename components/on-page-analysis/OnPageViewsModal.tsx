'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal, Table, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { OnPageViewClickContext, OnPageDetailRecord } from '@/types/onPageDetails';
import { fetchOnPageDetails } from '@/lib/api/onPageDetailsClient';
import { formatLocalDate } from '@/lib/types/api';
import { fetchAllRecords, downloadCsv, ExportCancelledError } from '@/lib/utils/csvExport';
import { getOnPageDimensionLabel } from '@/config/onPageDimensions';
import modalStyles from '@/styles/components/modal.module.css';
import stickyStyles from '@/styles/tables/sticky.module.css';
import { buildOnPageViewColumns } from './onPageViewColumns';
import styles from './OnPageViewsModal.module.css';

const ON_PAGE_CSV_HEADERS = [
  'Timestamp', 'Visitor ID', 'Session ID', 'Visit #',
  'Page Type', 'URL Path', 'Full URL',
  'Source', 'Campaign', 'Adset', 'Ad', 'UTM Term', 'Keyword', 'Placement', 'Referrer',
  'Device Type', 'Operating System', 'OS Version', 'Browser', 'Platform', 'Language', 'User Agent', 'Country',
  'Active Time (s)', 'Scroll %', 'Hero Scroll Passed', 'Form View', 'Form Started', 'Form Errors', 'Form Error Details', 'CTA Viewed', 'CTA Clicked',
  'First Contentful Paint (s)', 'Largest Contentful Paint (s)', 'Time to Interactive (s)', 'DOMContentLoaded (s)', 'Page Load (s)',
  'Timezone', 'Local Hour',
];

function buildOnPageCsvRow(r: OnPageDetailRecord): string {
  const q = (v: string | null | undefined) => `"${(v || '').replace(/"/g, '""')}"`;
  const bool = (v: boolean | undefined) => v ? 'Yes' : 'No';
  return [
    `"${new Date(r.createdAt).toLocaleString('en-GB')}"`,
    `"${r.ffVisitorId}"`, `"${r.sessionId || ''}"`, r.visitNumber ?? '',
    `"${r.pageType || 'unknown'}"`, q(r.urlPath), q(r.urlFull),
    q(r.utmSource), q(r.utmCampaign), q(r.utmContent), q(r.utmMedium),
    q(r.utmTerm), q(r.keyword), q(r.placement), q(r.referrer),
    `"${r.deviceType || ''}"`, `"${r.osName || ''}"`, `"${r.osVersion || ''}"`,
    `"${r.browserName || ''}"`, `"${r.platform || ''}"`, `"${r.language || ''}"`,
    q(r.userAgent), `"${r.countryCode || ''}"`,
    r.activeTimeS != null ? r.activeTimeS.toFixed(1) : '', r.scrollPercent ?? '',
    bool(r.heroScrollPassed), bool(r.formView), bool(r.formStarted),
    r.formErrors || 0,
    `"${r.formErrorsDetail ? r.formErrorsDetail.map(e => `${e.field}: ${e.error_count}`).join('; ') : ''}"`,
    bool(r.ctaViewed), bool(r.ctaClicked),
    r.fcpS != null ? r.fcpS.toFixed(2) : '', r.lcpS != null ? r.lcpS.toFixed(2) : '',
    r.ttiS != null ? r.ttiS.toFixed(2) : '', r.dclS != null ? r.dclS.toFixed(2) : '',
    r.loadS != null ? r.loadS.toFixed(2) : '',
    `"${r.timezone || ''}"`, r.localHourOfDay != null ? r.localHourOfDay : '',
  ].join(',');
}

function buildOnPageExportFilename(context: OnPageViewClickContext): string {
  const { start, end } = context.filters.dateRange;
  const dateStr = formatLocalDate(start);
  const endDateStr = formatLocalDate(end);
  const dateRangeStr = dateStr === endDateStr ? dateStr : `${dateStr}_${endDateStr}`;
  const filterParts = Object.values(context.filters.dimensionFilters)
    .map(value => value.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 20));
  const filterSuffix = filterParts.length > 0 ? `_${filterParts.join('_')}` : '';
  return `page_views_${dateRangeStr}${filterSuffix}.csv`;
}

interface OnPageViewsModalProps {
  open: boolean;
  onClose: () => void;
  context: OnPageViewClickContext | null;
}

export function OnPageViewsModal({ open, onClose, context }: OnPageViewsModalProps) {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ records: OnPageDetailRecord[]; total: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;
  const exportAbortRef = useRef<AbortController | null>(null);

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
    } else {
      exportAbortRef.current?.abort();
    }
  }, [open, context?.metricId]);

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
      const allRecords = await fetchAllRecords<OnPageDetailRecord>(
        (pagination) => fetchOnPageDetails(context, pagination),
        data.total,
        (fetched, total) => setExportProgress({ current: fetched, total }),
        abortController.signal,
      );

      const csvRows = [
        ON_PAGE_CSV_HEADERS.join(','),
        ...allRecords.map(buildOnPageCsvRow),
      ];
      downloadCsv(csvRows, buildOnPageExportFilename(context));
    } catch (err) {
      if (!(err instanceof ExportCancelledError)) {
        console.error('Export failed:', err);
      }
    } finally {
      setExporting(false);
      setExportProgress(null);
      exportAbortRef.current = null;
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

  const columns = useMemo(() => buildOnPageViewColumns(repeatRowIds), [repeatRowIds]);

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

      <div className={`${styles.tableWrap} ${stickyStyles.stickyTable}`}>
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
          sticky={{ offsetHeader: 0 }}
          size="small"
        />
      </div>
    </Modal>
  );
}
