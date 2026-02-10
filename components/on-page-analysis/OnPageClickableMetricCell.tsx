'use client';

import { GenericClickableMetricCell } from '@/components/shared/GenericClickableMetricCell';
import type { MetricFormat } from '@/types';
import type { OnPageViewClickContext } from '@/types/onPageDetails';
import type { DateRange } from '@/types';

interface OnPageClickableMetricCellProps {
  value: number;
  format: MetricFormat;
  metricId: string;
  metricLabel: string;
  rowKey: string;
  depth: number;
  dimensions: string[];
  dateRange: DateRange;
  onClick: (context: OnPageViewClickContext) => void;
}

/**
 * Clickable metric cell for On-Page Analysis.
 * Extracts dimension filters from the row key and passes to the click handler.
 */
export function OnPageClickableMetricCell(props: OnPageClickableMetricCellProps) {
  return (
    <GenericClickableMetricCell
      {...props}
      buildFilters={(parts, dimensions, dateRange) => {
        const dimensionFilters: Record<string, string> = {};
        parts.forEach((part, index) => {
          const dimId = dimensions[index];
          if (dimId && part) {
            dimensionFilters[dimId] = part;
          }
        });
        return { dateRange, dimensionFilters };
      }}
    />
  );
}
