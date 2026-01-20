import { formatMetric } from '../../lib/formatters';
import type { MetricFormat } from '@/types';
import styles from './MetricCell.module.css';

interface MetricCellProps {
  value: number;
  format: MetricFormat;
}

export function MetricCell({ value, format }: MetricCellProps) {
  const formatted = formatMetric(value, format);

  // Determine color for negative values (only for currency/percentage that can be negative)
  const isNegative = value < 0;

  return (
    <span className={`${styles.metricCell} ${isNegative ? styles.metricCellNegative : ''}`}>
      {formatted}
    </span>
  );
}
