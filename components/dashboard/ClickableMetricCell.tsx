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
}: ClickableMetricCellProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row expansion

    // Parse row key to extract filters
    // Row key format: "DENMARK" or "DENMARK::T-Formula" or "DENMARK::T-Formula::Google"
    const parts = rowKey.split('::');

    const filters: MetricClickContext['filters'] = {
      dateRange,
      country: dimensions[0] && parts[0] ? parts[0] : undefined,
      product: dimensions[1] && parts[1] ? parts[1] : undefined,
      source: dimensions[2] && parts[2] ? parts[2] : undefined,
    };

    onClick({
      metricId,
      metricLabel,
      value,
      filters,
    });
  };

  return (
    <div className={styles.clickableMetric} onClick={handleClick}>
      <MetricCell value={value} format={format} />
    </div>
  );
}
