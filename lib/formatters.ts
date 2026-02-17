import type { MetricFormat } from '@/types';

/**
 * Convert string to title case (capitalize first letter of each word)
 * Handles edge cases like already capitalized strings, single words, etc.
 */
export function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value).replace(/,/g, ' ');
}

export function formatPercentage(value: number): string {
  const pct = value * 100;
  if (pct > 0 && pct < 5) {
    return `${pct.toFixed(2)}%`;
  }
  return `${pct.toFixed(1)}%`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value).replace(/,/g, ' ');
}

export function formatDecimal(value: number): string {
  return formatNumber(Number(value.toFixed(1)));
}

export function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
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
    case 'time':
      return formatTime(value);
    default:
      return String(value);
  }
}
