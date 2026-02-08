'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Table, Tooltip, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { OnPageViewClickContext, OnPageDetailRecord, PageTypeSummary } from '@/types/onPageDetails';
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
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ records: OnPageDetailRecord[]; total: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageTypeSummary, setPageTypeSummary] = useState<PageTypeSummary[]>([]);
  const [activePageType, setActivePageType] = useState<string | null>(null);
  const pageSize = 100;

  useEffect(() => {
    if (open && context) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context, currentPage, activePageType]);

  const loadData = async () => {
    if (!context) return;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchOnPageDetails(
        context,
        { page: currentPage, pageSize },
        activePageType ?? undefined
      );
      setData({ records: result.records, total: result.total });
      // Only update tabs from unfiltered response (when no tab is selected)
      if (!activePageType) {
        setPageTypeSummary(result.pageTypeSummary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setCurrentPage(1);
      setActivePageType(null);
      setPageTypeSummary([]);
    }
  }, [open, context?.metricId]);

  const handleTabClick = (pageType: string | null) => {
    setActivePageType(pageType);
    setCurrentPage(1);
  };

  const allTotal = useMemo(
    () => pageTypeSummary.reduce((sum, s) => sum + s.count, 0),
    [pageTypeSummary]
  );

  const exportToCSV = useCallback(async () => {
    if (!context || !data?.total) return;
    setExporting(true);

    try {
      const allData = await fetchOnPageDetails(
        context,
        { page: 1, pageSize: Math.min(data.total, 10000) },
        activePageType ?? undefined
      );

      const headers = [
        'Timestamp', 'URL', 'Full URL', 'Visitor ID', 'Visit #',
        'Active Time (s)', 'Scroll %', 'Hero Scroll', 'Form View',
        'Form Started', 'Device', 'Country',
      ];

      const csvRows = [
        headers.join(','),
        ...allData.records.map((r) => [
          `"${new Date(r.createdAt).toLocaleString('en-GB')}"`,
          `"${(r.urlPath || '').replace(/"/g, '""')}"`,
          `"${(r.urlFull || '').replace(/"/g, '""')}"`,
          `"${r.ffVisitorId}"`,
          r.visitNumber ?? '',
          r.activeTimeS != null ? r.activeTimeS.toFixed(1) : '',
          r.scrollPercent ?? '',
          r.heroScrollPassed ? 'Yes' : 'No',
          r.formView ? 'Yes' : 'No',
          r.formStarted ? 'Yes' : 'No',
          `"${r.deviceType || ''}"`,
          `"${r.countryCode || ''}"`,
        ].join(',')),
      ];

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'page_views_export.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [context, data?.total, activePageType]);

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

  // Group same-visitor rows together (first appearance keeps position, repeats follow)
  const { sortedRecords, repeatRowIds } = useMemo(() => {
    if (!data?.records) return { sortedRecords: [] as OnPageDetailRecord[], repeatRowIds: new Set<string>() };
    const groups = new Map<string, OnPageDetailRecord[]>();
    for (const r of data.records) {
      if (!groups.has(r.ffVisitorId)) groups.set(r.ffVisitorId, []);
      groups.get(r.ffVisitorId)!.push(r);
    }
    const sorted: OnPageDetailRecord[] = [];
    const repeats = new Set<string>();
    const seen = new Set<string>();
    for (const r of data.records) {
      if (seen.has(r.ffVisitorId)) continue;
      seen.add(r.ffVisitorId);
      const group = groups.get(r.ffVisitorId)!;
      sorted.push(...group);
      for (let i = 1; i < group.length; i++) repeats.add(group[i].id);
    }
    return { sortedRecords: sorted, repeatRowIds: repeats };
  }, [data?.records]);

  const columns: ColumnsType<OnPageDetailRecord> = useMemo(() => [
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
    {
      title: 'URL Path',
      dataIndex: 'urlPath',
      width: 220,
      ellipsis: { showTitle: false },
      render: (val: string, record: OnPageDetailRecord) => {
        const href = record.urlFull || val;
        return (
          <div className={styles.urlCell}>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className={styles.urlLink}>
                {val || '–'}
              </a>
            ) : (val || '–')}
          </div>
        );
      },
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
      title: 'Device',
      dataIndex: 'deviceType',
      width: 80,
      render: (val: string | null) => (
        <span style={{ fontSize: 12 }}>{val || '–'}</span>
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
  ], [repeatRowIds]);

  return (
    <Modal
      title="Page Views"
      open={open}
      onCancel={onClose}
      width={1400}
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

      {pageTypeSummary.length > 1 && (
        <div className={styles.tabBar}>
          <button
            className={`${styles.tab} ${activePageType === null ? styles.tabActive : ''}`}
            onClick={() => handleTabClick(null)}
          >
            All
            <span className={styles.tabCount}>{allTotal.toLocaleString()}</span>
          </button>
          {pageTypeSummary.map((s) => (
            <button
              key={s.pageType}
              className={`${styles.tab} ${activePageType === s.pageType ? styles.tabActive : ''}`}
              onClick={() => handleTabClick(s.pageType)}
            >
              {s.pageType}
              <span className={styles.tabCount}>{s.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrap}>
        <Table
          columns={columns}
          dataSource={sortedRecords}
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
          scroll={{ x: 1420 }}
          size="small"
        />
      </div>
    </Modal>
  );
}
