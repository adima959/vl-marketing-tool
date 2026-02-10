'use client';

import { GenericClickableMetricCell } from '@/components/shared/GenericClickableMetricCell';
import type { MetricFormat } from '@/types';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import type { MarketingDetailMetricId } from '@/lib/server/crmMetrics';
import type { DateRange } from '@/types';

interface MarketingClickableMetricCellProps {
  value: number;
  format: MetricFormat;
  metricId: MarketingDetailMetricId;
  metricLabel: string;
  rowKey: string;
  depth: number;
  dimensions: string[];
  dateRange: DateRange;
  onClick: (context: MarketingMetricClickContext) => void;
  hideZero?: boolean;
}

/**
 * Marketing-specific wrapper for GenericClickableMetricCell
 * Maps row key parts to marketing filter structure (network, campaign, adset, ad, date, classifiedProduct, classifiedCountry)
 */
export function MarketingClickableMetricCell(props: MarketingClickableMetricCellProps) {
  return (
    <GenericClickableMetricCell
      {...props}
      buildFilters={(parts, dimensions, dateRange) => {
        // Initialize filters
        const filters: MarketingMetricClickContext['filters'] = {
          dateRange,
          network: undefined,
          campaign: undefined,
          adset: undefined,
          ad: undefined,
          date: undefined,
          classifiedProduct: undefined,
          classifiedCountry: undefined,
        };

        // Map row key parts to filters based on actual dimension order
        // Supports both advertising and classification dimensions
        type FilterKey = keyof typeof filters;
        const validKeys = new Set<string>(['network', 'campaign', 'adset', 'ad', 'date', 'classifiedProduct', 'classifiedCountry']);
        parts.forEach((part, index) => {
          const dimensionName = dimensions[index];
          if (dimensionName && part && validKeys.has(dimensionName)) {
            filters[dimensionName as Exclude<FilterKey, 'dateRange'>] = part;
          }
        });

        return filters;
      }}
    />
  );
}
