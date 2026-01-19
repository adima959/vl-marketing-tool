export type MetricFormat = 'number' | 'percentage' | 'currency' | 'decimal';

export type MetricCategory =
  | 'basic'
  | 'calculated'
  | 'costs_revenue'
  | 'conversions';

export interface MetricColumn {
  id: string;
  label: string;
  shortLabel: string;
  format: MetricFormat;
  category: MetricCategory;
  defaultVisible: boolean;
  width: number;
  align: 'left' | 'center' | 'right';
}
