import type { MetricColumn } from '@/types';

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
    id: 'crmSubscriptions',
    label: 'CRM Subscriptions',
    shortLabel: 'CRM Subs',
    format: 'number',
    category: 'conversions',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
  {
    id: 'approvedSales',
    label: 'Approved Subs',
    shortLabel: 'Approved Subs',
    format: 'number',
    category: 'conversions',
    defaultVisible: true,
    width: 120,
    align: 'right',
  },
  {
    id: 'approvalRate',
    label: 'Approval Rate',
    shortLabel: 'Approval Rate',
    format: 'percentage',
    category: 'conversions',
    defaultVisible: true,
    width: 120,
    align: 'right',
  },
  {
    id: 'realCpa',
    label: 'Real CPA',
    shortLabel: 'Real CPA',
    format: 'currency',
    category: 'conversions',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
];

export const DEFAULT_VISIBLE_COLUMNS = METRIC_COLUMNS
  .filter((col) => col.defaultVisible)
  .map((col) => col.id);
