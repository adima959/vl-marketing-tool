/**
 * Pure utility functions for CRM detail modal CSV export.
 * Extracted from CrmDetailModal.tsx to keep the component thin.
 */
import type { DetailRecord } from '@/types/dashboardDetails';
import type { MetricClickContext } from '@/types/dashboardDetails';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import type { OnPageViewClickContext } from '@/types/onPageDetails';

type CrmDetailVariant = 'dashboard' | 'marketing' | 'onPage';

type CrmDetailContext =
  | MetricClickContext
  | MarketingMetricClickContext
  | OnPageViewClickContext;

export const ON_PAGE_METRIC_LABELS: Record<string, string> = {
  crmTrials: 'CRM Trials',
  crmApproved: 'Approved Sales',
};

/**
 * Returns the CSV header row as an array of column names.
 */
export function buildCrmExportHeaders(variant: CrmDetailVariant, isBuyOrPayRate: boolean): string[] {
  if (variant === 'dashboard') {
    return [
      'Status', 'Customer Name', 'Source',
      'Tracking ID 1', 'Tracking ID 2', 'Tracking ID 3', 'Tracking ID 4', 'Tracking ID 5',
      'Amount', 'Date',
      ...(isBuyOrPayRate ? ['Bought at', 'Paid at'] : []),
    ];
  }
  return [
    'Status', 'Customer Name', 'Source',
    'Campaign ID', 'Ad Set ID', 'Ad ID', 'Product',
    'Amount', 'Date',
  ];
}

/**
 * Converts a single DetailRecord into a comma-separated CSV row string.
 */
export function buildCrmExportRow(record: DetailRecord, variant: CrmDetailVariant, isBuyOrPayRate: boolean): string {
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

  const fmtDateTime = (val: string): string => {
    const d = new Date(val);
    return `${d.toLocaleDateString('en-GB')} - ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const tail = [
    record.amount !== null && record.amount !== undefined ? Number(record.amount).toFixed(2) : '0.00',
    fmtDateTime(record.date),
    ...(isBuyOrPayRate
      ? [
          record.dateBought ? fmtDateTime(record.dateBought) : '',
          record.datePaid ? fmtDateTime(record.datePaid) : '',
        ]
      : []),
  ];

  return [...common, ...variantFields, ...tail].join(',');
}

/**
 * Builds a descriptive CSV filename from variant, context, and metric info.
 * Includes metric label, date range, and all active dimension filters.
 */
export function buildCrmExportFilename(
  variant: CrmDetailVariant,
  context: CrmDetailContext,
  _isBuyOrPayRate: boolean,
): string {
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
  const sanitize = (str: string): string =>
    str
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);

  const parts = [metricLabel, dateRangeStr, ...dimensionParts.map(sanitize)].filter(Boolean);
  return `${parts.join('_')}_export.csv`;
}
