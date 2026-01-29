import type { MetricColumn } from '@/types';
import type { ColumnGroup } from '@/types/table';

export const DASHBOARD_METRIC_COLUMNS: MetricColumn[] = [
  {
    id: 'customers',
    label: 'Customers',
    shortLabel: 'Cust',
    description: 'New customers (registration date = subscription date)',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    shortLabel: 'Subs',
    description: 'Total number of subscription orders',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 120,
    align: 'right',
  },
  {
    id: 'trials',
    label: 'Trials',
    shortLabel: 'Trials',
    description: 'Number of trial orders',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 100,
    align: 'right',
  },
  {
    id: 'trialsApproved',
    label: 'Trials - Approved',
    shortLabel: 'Approved',
    description: 'Number of approved trial orders (is_marked = 1)',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 120,
    align: 'right',
  },
  {
    id: 'upsells',
    label: 'Upsells',
    shortLabel: 'Upsells',
    description: 'Number of upsell orders',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 100,
    align: 'right',
  },
];

export const DASHBOARD_COLUMN_GROUPS: ColumnGroup[] = [
  {
    title: 'Order Metrics',
    metricIds: ['customers', 'subscriptions', 'trials', 'trialsApproved', 'upsells']
  },
];

export const DASHBOARD_DEFAULT_VISIBLE_COLUMNS = DASHBOARD_METRIC_COLUMNS
  .filter(col => col.defaultVisible)
  .map(col => col.id);
