import type { MetricFormat } from '@/types';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDecimal(value: number): string {
  return value.toFixed(4);
}

export function formatMetric(value: number, format: MetricFormat): string {
  switch (format) {
    case 'number':
      return formatNumber(value);
    case 'percentage':
      return formatPercentage(value);
    case 'currency':
      return formatCurrency(value);
    case 'decimal':
      return formatDecimal(value);
    default:
      return String(value);
  }
}
