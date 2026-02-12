import { Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { OnPageDetailRecord } from '@/types/onPageDetails';
import { formatDuration } from '@/lib/utils/displayFormatters';
import styles from './OnPageViewsModal.module.css';

export function buildOnPageViewColumns(
  repeatRowIds: Set<string>
): ColumnsType<OnPageDetailRecord> {
  return [
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
          <span className={styles.monoCell}>{val?.slice(0, 10)}\u2026</span>
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
          <span className={styles.monoCell}>{val ? `${val.slice(0, 10)}\u2026` : '\u2013'}</span>
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
        <span className={styles.monoCell}>{val ?? '\u2013'}</span>
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
              ) : '\u2013'}
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
        const display = val || record.urlPath || '\u2013';
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
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '\u2013'}</span></Tooltip>
      ),
    },
    {
      title: 'Campaign',
      dataIndex: 'utmCampaign',
      width: 130,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span className={styles.monoCell}>{val || '\u2013'}</span></Tooltip>
      ),
    },
    {
      title: 'Adset',
      dataIndex: 'utmContent',
      width: 130,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span className={styles.monoCell}>{val || '\u2013'}</span></Tooltip>
      ),
    },
    {
      title: 'Ad',
      dataIndex: 'utmMedium',
      width: 130,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span className={styles.monoCell}>{val || '\u2013'}</span></Tooltip>
      ),
    },
    {
      title: 'UTM Term',
      dataIndex: 'utmTerm',
      width: 100,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '\u2013'}</span></Tooltip>
      ),
    },
    {
      title: 'Keyword',
      dataIndex: 'keyword',
      width: 120,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '\u2013'}</span></Tooltip>
      ),
    },
    {
      title: 'Placement',
      dataIndex: 'placement',
      width: 150,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '\u2013'}</span></Tooltip>
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
            ) : '\u2013'}
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
        <span style={{ fontSize: 12 }}>{val || '\u2013'}</span>
      ),
    },
    {
      title: 'OS',
      dataIndex: 'osName',
      width: 70,
      render: (val: string | null) => (
        <span style={{ fontSize: 12 }}>{val || '\u2013'}</span>
      ),
    },
    {
      title: 'OS Version',
      dataIndex: 'osVersion',
      width: 90,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '\u2013'}</span></Tooltip>
      ),
    },
    {
      title: 'Browser',
      dataIndex: 'browserName',
      width: 80,
      render: (val: string | null) => (
        <span style={{ fontSize: 12 }}>{val || '\u2013'}</span>
      ),
    },
    {
      title: 'Platform',
      dataIndex: 'platform',
      width: 100,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '\u2013'}</span></Tooltip>
      ),
    },
    {
      title: 'Language',
      dataIndex: 'language',
      width: 80,
      align: 'center',
      render: (val: string | null) => (
        <span className={styles.monoCell}>{val || '\u2013'}</span>
      ),
    },
    {
      title: 'User Agent',
      dataIndex: 'userAgent',
      width: 200,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 11 }}>{val || '\u2013'}</span></Tooltip>
      ),
    },
    {
      title: 'Country',
      dataIndex: 'countryCode',
      width: 70,
      align: 'center',
      render: (val: string | null) => (
        <span className={styles.monoCell}>{val || '\u2013'}</span>
      ),
    },

    // ========== 5. ENGAGEMENT ==========
    {
      title: 'Active Time (s)',
      dataIndex: 'activeTimeS',
      width: 110,
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
        <span className={styles.monoCell}>{val != null ? `${val}%` : '\u2013'}</span>
      ),
    },
    {
      title: 'Hero Scroll',
      dataIndex: 'heroScrollPassed',
      width: 90,
      align: 'center',
      render: (val: boolean) => (
        <span className={val ? styles.boolTrue : styles.boolFalse}>
          {val ? '\u2713' : '\u2013'}
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
          {val ? '\u2713' : '\u2013'}
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
          {val ? '\u2713' : '\u2013'}
        </span>
      ),
    },
    {
      title: 'Form Errors',
      dataIndex: 'formErrors',
      width: 95,
      align: 'center',
      render: (val: number) => (
        <span className={val > 0 ? styles.boolTrue : styles.boolFalse}>
          {val > 0 ? val : '\u2013'}
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
          {val ? '\u2713' : '\u2013'}
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
          {val ? '\u2713' : '\u2013'}
        </span>
      ),
    },

    // ========== 6. PERFORMANCE ==========
    {
      title: (
        <Tooltip title="First Contentful Paint: Time when first content appears">
          <span>FCP (s)</span>
        </Tooltip>
      ),
      dataIndex: 'fcpS',
      width: 75,
      align: 'right',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val != null ? `${val.toFixed(1)}s` : '\u2013'}</span>
      ),
    },
    {
      title: (
        <Tooltip title="Largest Contentful Paint: Time when main content is visible">
          <span>LCP (s)</span>
        </Tooltip>
      ),
      dataIndex: 'lcpS',
      width: 75,
      align: 'right',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val != null ? `${val.toFixed(1)}s` : '\u2013'}</span>
      ),
    },
    {
      title: (
        <Tooltip title="Time to Interactive: When page becomes fully interactive">
          <span>TTI (s)</span>
        </Tooltip>
      ),
      dataIndex: 'ttiS',
      width: 75,
      align: 'right',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val != null ? `${val.toFixed(1)}s` : '\u2013'}</span>
      ),
    },
    {
      title: (
        <Tooltip title="DOMContentLoaded: When HTML is parsed and DOM is ready">
          <span>DCL (s)</span>
        </Tooltip>
      ),
      dataIndex: 'dclS',
      width: 75,
      align: 'right',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val != null ? `${val.toFixed(1)}s` : '\u2013'}</span>
      ),
    },
    {
      title: (
        <Tooltip title="Page Load: Time until page and all resources are fully loaded">
          <span>Load (s)</span>
        </Tooltip>
      ),
      dataIndex: 'loadS',
      width: 75,
      align: 'right',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val != null ? `${val.toFixed(1)}s` : '\u2013'}</span>
      ),
    },

    // ========== 7. USER CONTEXT ==========
    {
      title: 'Timezone',
      dataIndex: 'timezone',
      width: 120,
      ellipsis: { showTitle: false },
      render: (val: string | null) => (
        <Tooltip title={val}><span style={{ fontSize: 12 }}>{val || '\u2013'}</span></Tooltip>
      ),
    },
    {
      title: 'Local Hour',
      dataIndex: 'localHourOfDay',
      width: 90,
      align: 'center',
      render: (val: number | null) => (
        <span className={styles.monoCell}>{val != null ? `${val}:00` : '\u2013'}</span>
      ),
    },
  ];
}
