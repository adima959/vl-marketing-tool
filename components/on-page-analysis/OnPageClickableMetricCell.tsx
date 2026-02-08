'use client';

import { MetricCell } from '@/components/table/MetricCell';
import type { MetricFormat } from '@/types';
import type { OnPageViewClickContext } from '@/types/onPageDetails';
import type { DateRange } from '@/types';
import styles from '@/components/dashboard/ClickableMetricCell.module.css';

interface OnPageClickableMetricCellProps {
  value: number;
  format: MetricFormat;
  metricId: string;
  metricLabel: string;
  rowKey: string;
  dimensions: string[];
  dateRange: DateRange;
  onClick: (context: OnPageViewClickContext) => void;
}

/**
 * Clickable metric cell for On-Page Analysis.
 * Extracts dimension filters from the row key and passes to the click handler.
 */
export function OnPageClickableMetricCell({
  value,
  format,
  metricId,
  metricLabel,
  rowKey,
  dimensions,
  dateRange,
  onClick,
}: OnPageClickableMetricCellProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    const parts = rowKey.split('::');
    const dimensionFilters: Record<string, string> = {};

    parts.forEach((part, index) => {
      const dimId = dimensions[index];
      if (dimId && part) {
        dimensionFilters[dimId] = part;
      }
    });

    onClick({
      metricId,
      metricLabel,
      value,
      filters: { dateRange, dimensionFilters },
    });
  };

  return (
    <div className={styles.clickableMetric} onClick={handleClick}>
      <MetricCell value={value} format={format} />
    </div>
  );
}
