import type { MetricColumn } from '@/types';
import type { ColumnGroup } from '@/types/table';

export const NEW_ORDERS_METRIC_COLUMNS: MetricColumn[] = [
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
    id: 'ots',
    label: 'OTS (One-Time Sales)',
    shortLabel: 'OTS',
    description: 'Number of one-time upsell orders',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 100,
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
    id: 'customers',
    label: 'Customers',
    shortLabel: 'Cust',
    description: 'Unique customer count',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
];

export const NEW_ORDERS_COLUMN_GROUPS: ColumnGroup[] = [
  {
    title: 'Order Metrics',
    metricIds: ['subscriptions', 'ots', 'trials', 'customers']
  },
];

export const NEW_ORDERS_DEFAULT_VISIBLE_COLUMNS = NEW_ORDERS_METRIC_COLUMNS
  .filter(col => col.defaultVisible)
  .map(col => col.id);
