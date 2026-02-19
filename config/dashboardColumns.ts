import type { MetricColumn } from '@/types/metrics';
import { formatNumber } from '@/lib/formatters';

/** Helper: safe number extraction from metrics record */
function num(metrics: Record<string, number | string | null>, key: string): number {
  return Number(metrics[key] ?? 0);
}

export const DASHBOARD_METRIC_COLUMNS: MetricColumn[] = [
  {
    id: 'customers',
    label: 'New Customers',
    shortLabel: 'Cust',
    description: 'Unique new customers (deduplicated by customer ID)',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 80,
    align: 'right',
    tooltipFn: (m) => {
      const customers = num(m, 'customers');
      const upsellNew = num(m, 'upsellNewCustomers');
      if (!customers) return null;
      const lines = [`${formatNumber(customers)} new customers`];
      if (upsellNew > 0) lines.push(`+ ${formatNumber(upsellNew)} cross-sell only`);
      if (upsellNew > 0) lines.push(`= ${formatNumber(customers + upsellNew)} CRM total`);
      return lines;
    },
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    shortLabel: 'Subs',
    description: 'New subscriptions by creation date. CRM total also includes cross-sell subs (shown separately).',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 80,
    align: 'right',
    tooltipFn: (m) => {
      const subs = num(m, 'subscriptions');
      const upsellSubs = num(m, 'upsellSubs');
      if (!subs) return null;
      const crmTotal = subs + upsellSubs;
      const lines = [`${formatNumber(subs)} subs`];
      if (upsellSubs > 0) lines.push(`+ ${formatNumber(upsellSubs)} cross-sell subs`);
      if (upsellSubs > 0) lines.push(`= ${formatNumber(crmTotal)} CRM total`);
      return lines;
    },
  },
  {
    id: 'trials',
    label: 'Trials',
    shortLabel: 'Trials',
    description: 'Subscriptions with a trial invoice, counted by subscription creation date. CRM counts by invoice date — re-trials on existing subs may appear on a different date.',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 80,
    align: 'right',
    tooltipFn: (m) => {
      const trials = num(m, 'trials');
      const upsellTrials = num(m, 'upsellSubTrials');
      if (!trials) return null;
      const lines = [`${formatNumber(trials)} trials`];
      if (upsellTrials > 0) lines.push(`+ ${formatNumber(upsellTrials)} cross-sell trials`);
      if (upsellTrials > 0) lines.push(`= ${formatNumber(trials + upsellTrials)} CRM total`);
      return lines;
    },
  },
  {
    id: 'onHold',
    label: 'On Hold',
    shortLabel: 'On Hold',
    description: 'Subscriptions currently paused or on hold',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 80,
    align: 'right',
  },
  {
    id: 'trialsApproved',
    label: 'Approved Trials',
    shortLabel: 'Appr. Trials',
    description: 'Trials that converted to paying subscriptions after the trial period',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 100,
    align: 'right',
    tooltipFn: (m) => {
      const trials = num(m, 'trials');
      const approved = num(m, 'trialsApproved');
      if (!trials) return null;
      return [
        `${formatNumber(approved)} of ${formatNumber(trials)} trials approved`,
      ];
    },
  },
  {
    id: 'approvalRate',
    label: 'Trial Approval Rate (Approved / Subscriptions)',
    shortLabel: 'Trial Appr. %',
    description: 'Approved Trials ÷ Subscriptions — measures trial-to-paid conversion',
    format: 'percentage',
    category: 'calculated',
    defaultVisible: true,
    width: 110,
    align: 'right',
    tooltipFormula: { numerator: 'trialsApproved', denominator: 'subscriptions' },
  },
  {
    id: 'ots',
    label: 'One-Time Sales',
    shortLabel: 'OTS',
    description: 'One-time product purchases (not recurring subscriptions)',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 80,
    align: 'right',
    tooltipFn: (m) => {
      const ots = num(m, 'ots');
      const approved = num(m, 'otsApproved');
      if (!ots) return null;
      return [
        `${formatNumber(ots)} OTS · ${formatNumber(approved)} approved`,
      ];
    },
  },
  {
    id: 'otsApprovalRate',
    label: 'OTS Approval Rate (OTS Approved / OTS)',
    shortLabel: 'OTS Appr. %',
    description: 'OTS Approved ÷ OTS — measures one-time sale approval rate',
    format: 'percentage',
    category: 'calculated',
    defaultVisible: true,
    width: 110,
    align: 'right',
    tooltipFormula: { numerator: 'otsApproved', denominator: 'ots' },
  },
  {
    id: 'upsellsApproved',
    label: 'Upsells (Approved)',
    shortLabel: 'Upsells',
    description: 'Approved additional products sold to existing customers',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 80,
    align: 'right',
    tooltipFn: (m) => {
      const total = num(m, 'upsells');
      const approved = num(m, 'upsellsApproved');
      const deleted = num(m, 'upsellsDeleted');
      if (!total) return null;
      const lines = [`${formatNumber(total)} total upsells`];
      if (deleted > 0) lines.push(`${formatNumber(deleted)} deleted`);
      lines.push(`${formatNumber(approved)} approved`);
      return lines;
    },
  },
  {
    id: 'upsellApprovalRate',
    label: 'Upsell Approval Rate (Upsells Approved / Upsells)',
    shortLabel: 'Ups. Appv %',
    description: 'Upsells Approved ÷ Total Upsells — measures upsell approval rate',
    format: 'percentage',
    category: 'calculated',
    defaultVisible: true,
    width: 110,
    align: 'right',
    tooltipFormula: { numerator: 'upsellsApproved', denominator: 'upsells' },
  },
];

export const DASHBOARD_COLUMN_GROUPS = [
  {
    title: 'CRM Metrics',
    metricIds: DASHBOARD_METRIC_COLUMNS.map((col) => col.id),
  },
];
