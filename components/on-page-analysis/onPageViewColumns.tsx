import { Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { OnPageDetailRecord } from '@/types/onPageDetails';
import { formatDuration } from '@/lib/utils/displayFormatters';
import styles from './OnPageViewsModal.module.css';

type Col = ColumnsType<OnPageDetailRecord>[number];

// ============================================================================
// Column factory helpers — eliminate repetitive render patterns
// ============================================================================

/** Plain text column (no tooltip) */
function textCol(title: string, dataIndex: string, width: number): Col {
  return { title, dataIndex, width, render: (val: string | null) => <span style={{ fontSize: 12 }}>{val || '\u2013'}</span> };
}

/** Text column with tooltip and ellipsis */
function tooltipCol(title: string, dataIndex: string, width: number, fontSize = 12): Col {
  return { title, dataIndex, width, ellipsis: { showTitle: false }, render: (val: string | null) => <Tooltip title={val}><span style={{ fontSize }}>{val || '\u2013'}</span></Tooltip> };
}

/** Monospace column with tooltip and ellipsis */
function monoTooltipCol(title: string, dataIndex: string, width: number): Col {
  return { title, dataIndex, width, ellipsis: { showTitle: false }, render: (val: string | null) => <Tooltip title={val}><span className={styles.monoCell}>{val || '\u2013'}</span></Tooltip> };
}

/** Monospace column (no tooltip) */
function monoCol(title: string, dataIndex: string, width: number): Col {
  return { title, dataIndex, width, align: 'center', render: (val: string | null) => <span className={styles.monoCell}>{val || '\u2013'}</span> };
}

/** Boolean checkmark column */
function boolCol(title: string, dataIndex: string, width: number): Col {
  return { title, dataIndex, width, align: 'center', render: (val: boolean) => <span className={val ? styles.boolTrue : styles.boolFalse}>{val ? '\u2713' : '\u2013'}</span> };
}

/** Performance metric column (seconds, tooltip header) */
function perfCol(label: string, tooltip: string, dataIndex: string): Col {
  return {
    title: <Tooltip title={tooltip}><span>{label}</span></Tooltip>,
    dataIndex, width: 75, align: 'right',
    render: (val: number | null) => <span className={styles.monoCell}>{val != null ? `${val.toFixed(1)}s` : '\u2013'}</span>,
  };
}

/** URL link column with tooltip */
function urlLinkCol(title: string, dataIndex: string, width: number): Col {
  return {
    title, dataIndex, width, ellipsis: { showTitle: false },
    render: (val: string | null) => (
      <Tooltip title={val}>
        <div className={styles.urlCell}>
          {val ? <a href={val} target="_blank" rel="noopener noreferrer" className={styles.urlLink}>{val}</a> : '\u2013'}
        </div>
      </Tooltip>
    ),
  };
}

// ============================================================================
// Column builder
// ============================================================================

export function buildOnPageViewColumns(
  repeatRowIds: Set<string>
): ColumnsType<OnPageDetailRecord> {
  return [
    // ========== 1. SESSION/IDENTITY ==========
    {
      title: 'Timestamp', dataIndex: 'createdAt', width: 140, fixed: 'left',
      render: (val: string) => (
        <span className={styles.dateCell}>
          {new Date(val).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      title: 'Visitor ID', dataIndex: 'ffVisitorId', width: 120, ellipsis: { showTitle: false },
      render: (val: string) => <Tooltip title={val}><span className={styles.monoCell}>{val?.slice(0, 10)}\u2026</span></Tooltip>,
    },
    {
      title: 'Session ID', dataIndex: 'sessionId', width: 120, ellipsis: { showTitle: false },
      render: (val: string | null) => <Tooltip title={val}><span className={styles.monoCell}>{val ? `${val.slice(0, 10)}\u2026` : '\u2013'}</span></Tooltip>,
    },
    {
      title: 'Unique', dataIndex: 'id', width: 50, align: 'center',
      render: (_: string, record: OnPageDetailRecord) => !repeatRowIds.has(record.id) ? <span className={styles.uniqueBadge}>1st</span> : null,
    },
    {
      title: 'Visit #', dataIndex: 'visitNumber', width: 70, align: 'center',
      render: (val: number | null) => <span className={styles.monoCell}>{val ?? '\u2013'}</span>,
    },

    // ========== 2. PAGE/URL ==========
    textCol('Type', 'pageType', 90),
    urlLinkCol('URL Path', 'urlPath', 220),
    {
      title: 'Full URL', dataIndex: 'urlFull', width: 300, ellipsis: { showTitle: false },
      render: (val: string | null, record: OnPageDetailRecord) => {
        const href = val || record.urlPath || '';
        const display = val || record.urlPath || '\u2013';
        return (
          <div className={styles.urlCell}>
            {href ? <a href={href} target="_blank" rel="noopener noreferrer" className={styles.urlLink}>{display}</a> : display}
          </div>
        );
      },
    },

    // ========== 3. TRAFFIC SOURCE ==========
    tooltipCol('Source', 'utmSource', 90),
    monoTooltipCol('Campaign', 'utmCampaign', 130),
    monoTooltipCol('Adset', 'utmContent', 130),
    monoTooltipCol('Ad', 'utmMedium', 130),
    tooltipCol('UTM Term', 'utmTerm', 100),
    tooltipCol('Keyword', 'keyword', 120),
    tooltipCol('Placement', 'placement', 150),
    urlLinkCol('Referrer', 'referrer', 200),

    // ========== 4. DEVICE/ENVIRONMENT ==========
    textCol('Device', 'deviceType', 80),
    textCol('OS', 'osName', 70),
    textCol('Browser', 'browserName', 80),
    tooltipCol('Platform', 'platform', 100),
    monoCol('Language', 'language', 80),
    tooltipCol('User Agent', 'userAgent', 200, 11),
    monoCol('Country', 'countryCode', 70),

    // ========== 5. ENGAGEMENT ==========
    {
      title: 'Active Time (s)', dataIndex: 'activeTimeS', width: 110, align: 'right',
      render: (val: number | null) => <span className={styles.monoCell}>{formatDuration(val)}</span>,
    },
    {
      title: 'Scroll %', dataIndex: 'scrollPercent', width: 80, align: 'right',
      render: (val: number | null) => <span className={styles.monoCell}>{val != null ? `${val}%` : '\u2013'}</span>,
    },
    boolCol('Hero Scroll', 'heroScrollPassed', 90),
    boolCol('Form View', 'formView', 80),
    boolCol('Form Start', 'formStarted', 80),
    {
      title: 'Form Errors', dataIndex: 'formErrors', width: 95, align: 'center',
      render: (val: number) => <span className={val > 0 ? styles.boolTrue : styles.boolFalse}>{val > 0 ? val : '\u2013'}</span>,
    },
    boolCol('CTA View', 'ctaViewed', 80),
    boolCol('CTA Click', 'ctaClicked', 80),

    // ========== 6. PERFORMANCE ==========
    perfCol('FCP (s)', 'First Contentful Paint: Time when first content appears', 'fcpS'),
    perfCol('LCP (s)', 'Largest Contentful Paint: Time when main content is visible', 'lcpS'),
    perfCol('TTI (s)', 'Time to Interactive: When page becomes fully interactive', 'ttiS'),
    perfCol('DCL (s)', 'DOMContentLoaded: When HTML is parsed and DOM is ready', 'dclS'),
    perfCol('Load (s)', 'Page Load: Time until page and all resources are fully loaded', 'loadS'),

    // ========== 7. USER CONTEXT ==========
    tooltipCol('Timezone', 'timezone', 120),
    {
      title: 'Local Hour', dataIndex: 'localHourOfDay', width: 90, align: 'center',
      render: (val: number | null) => <span className={styles.monoCell}>{val != null ? `${val}:00` : '\u2013'}</span>,
    },
  ];
}
