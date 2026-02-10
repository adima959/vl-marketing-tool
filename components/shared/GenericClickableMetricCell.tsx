'use client';

import { MetricCell } from '@/components/table/MetricCell';
import type { MetricFormat } from '@/types';
import type { DateRange } from '@/types';
import styles from '@/components/dashboard/ClickableMetricCell.module.css';

interface BaseMetricClickContext<TMetricId, TFilters> {
  metricId: TMetricId;
  metricLabel: string;
  value: number;
  filters: TFilters;
}

interface GenericClickableMetricCellProps<TMetricId, TFilters extends Record<string, any>> {
  value: number;
  format: MetricFormat;
  metricId: TMetricId;
  metricLabel: string;
  rowKey: string;
  depth: number;
  dimensions: string[];
  dateRange: DateRange;
  onClick: (context: BaseMetricClickContext<TMetricId, TFilters>) => void;
  hideZero?: boolean;
  /**
   * Function to build filter object from row key parts and dimensions
   * Allows each usage to define its own filter structure
   */
  buildFilters: (parts: string[], dimensions: string[], dateRange: DateRange) => TFilters;
}

/**
 * Generic wrapper component that makes MetricCell clickable
 * Extracts filter context from row key and passes to onClick handler
 *
 * @example
 * ```tsx
 * // Dashboard usage
 * <GenericClickableMetricCell
 *   value={100}
 *   format="number"
 *   metricId="customers"
 *   metricLabel="Customers"
 *   rowKey="DENMARK::T-Formula"
 *   dimensions={['country', 'product']}
 *   dateRange={dateRange}
 *   onClick={handleClick}
 *   buildFilters={(parts, dims, range) => ({
 *     dateRange: range,
 *     country: dims[0] === 'country' ? parts[0] : undefined,
 *     product: dims[1] === 'product' ? parts[1] : undefined,
 *   })}
 * />
 * ```
 */
export function GenericClickableMetricCell<TMetricId, TFilters extends Record<string, any>>({
  value,
  format,
  metricId,
  metricLabel,
  rowKey,
  dimensions,
  dateRange,
  onClick,
  hideZero = false,
  buildFilters,
}: GenericClickableMetricCellProps<TMetricId, TFilters>) {
  // Hide zero values if hideZero is true
  if (hideZero && value === 0) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row expansion

    // Parse row key to extract filter values
    // Row key format: "value1" or "value1::value2" or "value1::value2::value3"
    const parts = rowKey.split('::');

    // Build filters using the provided function
    const filters = buildFilters(parts, dimensions, dateRange);

    onClick({
      metricId,
      metricLabel,
      value,
      filters,
    });
  };

  return (
    <div className={styles.clickableMetric} onClick={handleClick}>
      <MetricCell value={value} format={format} hideZero={hideZero} />
    </div>
  );
}
