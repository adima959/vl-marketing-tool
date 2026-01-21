export type MetricFormat = 'number' | 'percentage' | 'currency' | 'decimal';

export interface MetricColumn {
  id: string;
  label: string;
  shortLabel: string;
  format: MetricFormat;
  category: 'basic' | 'calculated' | 'costs_revenue' | 'conversions';
  defaultVisible: boolean;
  width: number;
  align: 'left' | 'center' | 'right';
}
