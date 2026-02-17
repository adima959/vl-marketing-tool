import type { MetricColumn } from '@/types';
import { formatNumber } from '@/lib/formatters';

/** Helper: safe number extraction from metrics record */
function num(metrics: Record<string, number | string | null>, key: string): number {
  return Number(metrics[key] ?? 0);
}

export const METRIC_COLUMNS: MetricColumn[] = [
  // Basic Metrics
  {
    id: 'impressions',
    label: 'Impressions',
    shortLabel: 'Impr',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
  {
    id: 'clicks',
    label: 'Clicks',
    shortLabel: 'Clicks',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 90,
    align: 'right',
  },
  {
    id: 'ctr',
    label: 'Click-Through Rate',
    shortLabel: 'CTR',
    format: 'percentage',
    category: 'basic',
    defaultVisible: true,
    width: 90,
    align: 'right',
  },

  // Cost Metrics
  {
    id: 'cost',
    label: 'Cost',
    shortLabel: 'Cost',
    format: 'currency',
    category: 'costs_revenue',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
  {
    id: 'cpc',
    label: 'Cost Per Click',
    shortLabel: 'CPC',
    format: 'currency',
    category: 'costs_revenue',
    defaultVisible: true,
    width: 90,
    align: 'right',
  },
  {
    id: 'cpm',
    label: 'Cost Per Mille',
    shortLabel: 'CPM',
    format: 'currency',
    category: 'costs_revenue',
    defaultVisible: true,
    width: 90,
    align: 'right',
  },

  // Conversion Metrics
  {
    id: 'conversions',
    label: 'Conversions',
    shortLabel: 'Conv',
    format: 'number',
    category: 'conversions',
    defaultVisible: true,
    width: 90,
    align: 'right',
  },

  // CRM Metrics
  {
    id: 'customers',
    label: 'New Customers',
    shortLabel: 'Cust',
    format: 'number',
    category: 'crm',
    defaultVisible: false,
    width: 80,
    align: 'right',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    shortLabel: 'Subs',
    format: 'number',
    category: 'crm',
    defaultVisible: true,
    width: 80,
    align: 'right',
  },
  {
    id: 'trials',
    label: 'Trials',
    shortLabel: 'Trials',
    format: 'number',
    category: 'crm',
    defaultVisible: true,
    width: 80,
    align: 'right',
  },
  {
    id: 'onHold',
    label: 'On Hold',
    shortLabel: 'On Hold',
    format: 'number',
    category: 'crm',
    defaultVisible: false,
    width: 80,
    align: 'right',
  },
  {
    id: 'trialsApproved',
    label: 'Approved Trials',
    shortLabel: 'Appr. Trials',
    format: 'number',
    category: 'crm',
    defaultVisible: false,
    width: 100,
    align: 'right',
    tooltipFn: (m) => {
      const t = num(m, 'trials');
      const approved = num(m, 'trialsApproved');
      if (!t) return null;
      return [`${formatNumber(approved)} of ${formatNumber(t)} trials approved`];
    },
  },
  {
    id: 'approvalRate',
    label: 'Trial Approval Rate (Approved / Subscriptions)',
    shortLabel: 'Trial Appr. %',
    format: 'percentage',
    category: 'crm',
    defaultVisible: true,
    width: 110,
    align: 'right',
    tooltipFormula: { numerator: 'trialsApproved', denominator: 'subscriptions' },
  },
  {
    id: 'ots',
    label: 'One-Time Sales',
    shortLabel: 'OTS',
    format: 'number',
    category: 'crm',
    defaultVisible: false,
    width: 80,
    align: 'right',
    tooltipFn: (m) => {
      const o = num(m, 'ots');
      const approved = num(m, 'otsApproved');
      if (!o) return null;
      return [`${formatNumber(o)} OTS · ${formatNumber(approved)} approved`];
    },
  },
  {
    id: 'otsApprovalRate',
    label: 'OTS Approval Rate (OTS Approved / OTS)',
    shortLabel: 'OTS Appr. %',
    format: 'percentage',
    category: 'crm',
    defaultVisible: false,
    width: 110,
    align: 'right',
    tooltipFormula: { numerator: 'otsApproved', denominator: 'ots' },
  },
  {
    id: 'upsellsApproved',
    label: 'Upsells (Approved)',
    shortLabel: 'Upsells',
    format: 'number',
    category: 'crm',
    defaultVisible: true,
    width: 80,
    align: 'right',
  },
  {
    id: 'upsellApprovalRate',
    label: 'Upsell Approval Rate (Upsells Approved / Upsells)',
    shortLabel: 'Ups. Appv %',
    format: 'percentage',
    category: 'crm',
    defaultVisible: false,
    width: 110,
    align: 'right',
    tooltipFormula: { numerator: 'upsellsApproved', denominator: 'upsells' },
  },
  {
    id: 'realCpa',
    label: 'Real CPA (Cost / Trials)',
    shortLabel: 'Real CPA',
    format: 'number',
    category: 'crm',
    defaultVisible: true,
    width: 100,
    align: 'right',
    tooltipFormula: { numerator: 'cost', denominator: 'trials' },
  },
];

export const MARKETING_METRIC_IDS = ['impressions', 'clicks', 'ctr', 'cost', 'cpc', 'cpm', 'conversions'] as const;

export const CRM_METRIC_IDS = [
  'customers', 'subscriptions', 'trials', 'onHold',
  'trialsApproved', 'approvalRate',
  'ots', 'otsApprovalRate',
  'upsellsApproved', 'upsellApprovalRate',
  'realCpa',
] as const;

export const DEFAULT_VISIBLE_COLUMNS = METRIC_COLUMNS
  .filter((col) => col.defaultVisible)
  .map((col) => col.id);
