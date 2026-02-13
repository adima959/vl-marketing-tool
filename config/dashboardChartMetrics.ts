/**
 * Metric configuration for the dashboard time series chart.
 *
 * Key order controls both legend order and tooltip sort order.
 * See MEMORY.md for color assignments and default visibility.
 */
export const METRIC_CONFIG = {
  customers: {
    key: 'customers',
    label: 'Customers',
    color: '#8b5cf6',
    defaultVisible: false,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
  subscriptions: {
    key: 'subscriptions',
    label: 'Subscriptions',
    color: '#3b82f6',
    defaultVisible: true,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
  trialsApproved: {
    key: 'trialsApproved',
    label: 'Trials',
    color: '#00B96B',
    defaultVisible: true,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
  onHold: {
    key: 'onHold',
    label: 'On Hold',
    color: '#ef4444',
    defaultVisible: false,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
  approvalRate: {
    key: 'approvalRate',
    label: 'Trial Appr. %',
    color: '#10b981',
    defaultVisible: true,
    yAxisId: 'right',
    isPercentage: true,
    isArea: true,
  },
  upsells: {
    key: 'upsells',
    label: 'Upsells',
    color: '#d97706',
    defaultVisible: true,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
  ots: {
    key: 'ots',
    label: 'OTS',
    color: '#7c8db5',
    defaultVisible: true,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
} as const;

export type MetricKey = keyof typeof METRIC_CONFIG;
