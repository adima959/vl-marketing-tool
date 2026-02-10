'use client';

import { GenericClickableMetricCell } from '@/components/shared/GenericClickableMetricCell';
import type { MetricFormat } from '@/types';
import type { MetricClickContext } from '@/types/dashboardDetails';
import type { DashboardDetailMetricId } from '@/lib/server/crmMetrics';
import type { DateRange } from '@/types/dashboard';

interface ClickableMetricCellProps {
  value: number;
  format: MetricFormat;
  metricId: DashboardDetailMetricId;
  metricLabel: string;
  rowKey: string;
  depth: number;
  dimensions: string[];
  dateRange: DateRange;
  onClick: (context: MetricClickContext) => void;
  hideZero?: boolean;
}

/**
 * Dashboard-specific wrapper for GenericClickableMetricCell
 * Maps row key parts to dashboard filter structure (country, productName, product, source)
 */
export function ClickableMetricCell(props: ClickableMetricCellProps) {
  return (
    <GenericClickableMetricCell
      {...props}
      buildFilters={(parts, dimensions, dateRange) => {
        // Initialize filters
        const filters: MetricClickContext['filters'] = {
          dateRange,
          country: undefined,
          productName: undefined,
          product: undefined,
          source: undefined,
        };

        // Map row key parts to filters based on actual dimension order
        parts.forEach((part, index) => {
          const dimensionName = dimensions[index];
          if (dimensionName && part) {
            filters[dimensionName as 'country' | 'productName' | 'product' | 'source'] = part;
          }
        });

        return filters;
      }}
    />
  );
}
