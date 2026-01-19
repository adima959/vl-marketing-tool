import { formatMetric } from '../../lib/formatters';
import type { MetricFormat } from '@/types';

interface MetricCellProps {
  value: number;
  format: MetricFormat;
}

export function MetricCell({ value, format }: MetricCellProps) {
  const formatted = formatMetric(value, format);

  // Determine color for negative values (only for currency/percentage that can be negative)
  const isNegative = value < 0;
  const color = isNegative ? '#ff4d4f' : undefined;

  return (
    <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>
      {formatted}
    </span>
  );
}
