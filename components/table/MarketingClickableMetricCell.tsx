'use client';

import { MetricCell } from '@/components/table/MetricCell';
import type { MetricFormat } from '@/types';
import type { MarketingMetricClickContext } from '@/types/marketingDetails';
import type { DateRange } from '@/types';
import styles from '@/components/dashboard/ClickableMetricCell.module.css';

interface MarketingClickableMetricCellProps {
  value: number;
  format: MetricFormat;
  metricId: 'crmSubscriptions' | 'approvedSales';
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
    };

    // Map row key parts to filters based on actual dimension order
    // Marketing report dimensions: network, campaign, adset, ad, date
    parts.forEach((part, index) => {
      const dimensionName = dimensions[index];
      if (dimensionName && part) {
        // Map the dimension name to the filter property
        filters[dimensionName as 'network' | 'campaign' | 'adset' | 'ad' | 'date'] = part;
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
