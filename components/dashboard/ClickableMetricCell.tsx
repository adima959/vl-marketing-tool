'use client';

import { MetricCell } from '@/components/table/MetricCell';
import type { MetricFormat } from '@/types';
import type { MetricClickContext } from '@/types/dashboardDetails';
import type { DateRange } from '@/types/dashboard';
import styles from './ClickableMetricCell.module.css';

interface ClickableMetricCellProps {
  value: number;
  format: MetricFormat;
  metricId: 'customers' | 'subscriptions' | 'trials' | 'trialsApproved' | 'upsells';
  metricLabel: string;
  rowKey: string;
  depth: number;
  dimensions: string[];
  dateRange: DateRange;
  onClick: (context: MetricClickContext) => void;
  hideZero?: boolean;
}

/**
 * Wrapper component that makes MetricCell clickable
 * Extracts filter context from row key and passes to onClick handler
 */
export function ClickableMetricCell({
  value,
  format,
  metricId,
  metricLabel,
  rowKey,
  dimensions,
  dateRange,
  onClick,
  hideZero = false,
}: ClickableMetricCellProps) {
  // Hide zero values if hideZero is true
  if (hideZero && value === 0) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row expansion

    // Parse row key to extract filters
    // Row key format: "DENMARK" or "DENMARK::T-Formula" or "DENMARK::T-Formula::Google"
    const parts = rowKey.split('::');

    // Initialize filters
    const filters: MetricClickContext['filters'] = {
      dateRange,
      country: undefined,
      product: undefined,
      source: undefined,
    };

    // Map row key parts to filters based on actual dimension order
    // The row key parts correspond to the dimension order, not fixed positions
    parts.forEach((part, index) => {
      const dimensionName = dimensions[index];
      if (dimensionName && part) {
        // Map the dimension name to the filter property
        filters[dimensionName as 'country' | 'product' | 'source'] = part;
      }
    });

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
