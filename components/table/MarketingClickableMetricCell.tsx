'use client';

import { MetricCell } from '@/components/table/MetricCell';
import type { MetricFormat } from '@/types';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import type { MarketingDetailMetricId } from '@/lib/server/crmMetrics';
import type { DateRange } from '@/types';
import styles from '@/components/dashboard/ClickableMetricCell.module.css';

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
 * Wrapper component that makes MetricCell clickable for Marketing Report
 * Extracts filter context from row key and passes to onClick handler
 */
export function MarketingClickableMetricCell({
  value,
  format,
  metricId,
  metricLabel,
  rowKey,
  dimensions,
  dateRange,
  onClick,
  hideZero = false,
}: MarketingClickableMetricCellProps) {
  // Hide zero values if hideZero is true
  if (hideZero && value === 0) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row expansion

    // Parse row key to extract filters
    // Row key format: "Google Ads" or "Google Ads::Campaign Name" or "Google Ads::Campaign::AdSet::Ad"
    const parts = rowKey.split('::');

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
    // Supports both advertising (network, campaign, adset, ad, date) and
    // classification (classifiedProduct, classifiedCountry) dimensions
    type FilterKey = keyof typeof filters;
    const validKeys = new Set<string>(['network', 'campaign', 'adset', 'ad', 'date', 'classifiedProduct', 'classifiedCountry']);
    parts.forEach((part, index) => {
      const dimensionName = dimensions[index];
      if (dimensionName && part && validKeys.has(dimensionName)) {
        filters[dimensionName as Exclude<FilterKey, 'dateRange'>] = part;
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
