export type MetricFormat = 'number' | 'percentage' | 'currency' | 'decimal' | 'time';

export interface MetricColumn {
  id: string;
  label: string;
  shortLabel: string;
  description?: string;
  format: MetricFormat;
  category: 'basic' | 'calculated' | 'costs_revenue' | 'conversions';
  defaultVisible: boolean;
  width: number;
  align: 'left' | 'center' | 'right';
}
