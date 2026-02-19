export type MetricFormat = 'number' | 'percentage' | 'currency' | 'decimal' | 'time';

export interface MetricColumn {
  id: string;
  label: string;
  shortLabel: string;
  description?: string;
  format: MetricFormat;
  category: 'basic' | 'calculated' | 'costs_revenue' | 'conversions' | 'crm';
  defaultVisible: boolean;
  width: number;
  align: 'left' | 'center' | 'right';
  /** For calculated metrics: shows "numerator / denominator = value" on cell hover */
  tooltipFormula?: { numerator: string; denominator: string };
  /** Custom tooltip function: receives row metrics, returns tooltip lines (null to skip) */
  tooltipFn?: (metrics: Record<string, number | string | null>) => string[] | null;
}
