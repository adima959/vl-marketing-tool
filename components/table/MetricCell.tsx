import { formatMetric } from '../../lib/formatters';
import type { MetricFormat } from '@/types';
import styles from './MetricCell.module.css';

interface MetricCellProps {
  value: number;
  format: MetricFormat;
  hideZero?: boolean;
}

export function MetricCell({ value, format, hideZero = false }: MetricCellProps) {
  // Hide zero values if hideZero is true
  if (hideZero && value === 0) {
    return null;
  }

  const formatted = formatMetric(value, format);

  // Determine color for negative values (only for currency/percentage that can be negative)
  const isNegative = value < 0;

  return (
    <span className={`${styles.metricCell} ${isNegative ? styles.metricCellNegative : ''}`}>
      {formatted}
    </span>
  );
}
