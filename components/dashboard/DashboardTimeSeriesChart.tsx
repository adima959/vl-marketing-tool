'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TimeSeriesDataPoint } from '@/types/dashboard';
import { fetchDashboardTimeSeries } from '@/lib/api/dashboardClient';
import styles from './DashboardTimeSeriesChart.module.css';

const CHART_HEIGHT = 300;

/**
 * Extended data point with calculated approval rate
 */
interface ChartDataPoint extends TimeSeriesDataPoint {
  approvalRate: number | null;
}

/**
 * Metric configuration for chart visualization
 */
const METRIC_CONFIG = {
  trials: {
    key: 'trials',
    label: 'Trials',
    color: '#1a1a1a',
    defaultVisible: true,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
  trialsApproved: {
    key: 'trialsApproved',
    label: 'Approved',
    color: '#00B96B',
    defaultVisible: true,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
  approvalRate: {
    key: 'approvalRate',
    label: 'Approval %',
    color: '#10b981',
    defaultVisible: true,
    yAxisId: 'right',
    isPercentage: true,
    isArea: true,
  },
  subscriptions: {
    key: 'subscriptions',
    label: 'Subscriptions',
    color: '#3b82f6',
    defaultVisible: false,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
  customers: {
    key: 'customers',
    label: 'Customers',
    color: '#8b5cf6',
    defaultVisible: false,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
  upsells: {
    key: 'upsells',
    label: 'Upsells',
    color: '#f97316',
    defaultVisible: false,
    yAxisId: 'left',
    isPercentage: false,
    isArea: false,
  },
} as const;

type MetricKey = keyof typeof METRIC_CONFIG;

/**
 * Get date range for last N days (default 14)
 */
function getLast14DaysRange(): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setDate(start.getDate() - 13); // 14 days including today
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

/**
 * Format date for X axis labels (e.g., "Jan 24")
 */
function formatXAxisDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format date for tooltip (e.g., "Friday, Jan 24, 2026")
 */
function formatTooltipDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Custom tooltip props interface
 */
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    name?: string;
    value?: number;
    color?: string;
    fill?: string;
    stroke?: string;
  }>;
  label?: string;
}

/**
 * Custom tooltip component
 */
function CustomTooltip({
  active,
  payload,
  label,
}: CustomTooltipProps): React.ReactElement | null {
  if (!active || !payload || !payload.length) {
    return null;
  }

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{formatTooltipDate(label || '')}</div>
      <div className={styles.tooltipMetrics}>
        {payload.map((entry) => {
          const metricConfig = Object.values(METRIC_CONFIG).find(
            (m) => m.key === entry.dataKey
          );
          const isPercentage = metricConfig?.isPercentage || false;
          const formattedValue = isPercentage
            ? `${entry.value?.toFixed(1)}%`
            : entry.value;
          // Use stroke for lines, fall back to fill for areas
          const dotColor = entry.stroke || entry.color || entry.fill;

          return (
            <div key={entry.dataKey} className={styles.tooltipRow}>
              <span
                className={styles.tooltipDot}
                style={{ backgroundColor: dotColor }}
              />
              <span className={styles.tooltipLabel}>{entry.name}</span>
              <span className={styles.tooltipValue}>{formattedValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Skeleton loading placeholder for chart
 */
function ChartSkeleton(): React.ReactElement {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonYAxis}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className={styles.skeletonYTick} />
        ))}
      </div>
      <div className={styles.skeletonContent}>
        <div className={styles.skeletonGrid}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className={styles.skeletonGridLine} />
          ))}
        </div>
        <div className={styles.skeletonLine} />
      </div>
    </div>
  );
}

/**
 * Dashboard time series chart showing daily metrics for the last 14 days
 * Always shows 14 days regardless of table date range selection
 */
export function DashboardTimeSeriesChart(): React.ReactElement {
  const [data, setData] = useState<TimeSeriesDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleMetrics, setVisibleMetrics] = useState<Set<MetricKey>>(() => {
    const defaults = new Set<MetricKey>();
    Object.entries(METRIC_CONFIG).forEach(([key, config]) => {
      if (config.defaultVisible) {
        defaults.add(key as MetricKey);
      }
    });
    return defaults;
  });

  // Always use last 14 days - computed once on mount
  const dateRange = useMemo(() => getLast14DaysRange(), []);

  // Fetch data on mount (only once since dateRange is stable)
  useEffect(() => {
    let cancelled = false;

    async function loadData(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchDashboardTimeSeries(dateRange);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load chart data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  // Toggle metric visibility
  const toggleMetric = useCallback((metricKey: MetricKey) => {
    setVisibleMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(metricKey)) {
        // Don't allow removing the last visible metric
        if (next.size > 1) {
          next.delete(metricKey);
        }
      } else {
        next.add(metricKey);
      }
      return next;
    });
  }, []);

  // Memoize chart data with calculated approval rate
  const chartData = useMemo((): ChartDataPoint[] => {
    return data.map((point) => ({
      ...point,
      // Calculate approval rate as percentage
      approvalRate: point.trials > 0
        ? (point.trialsApproved / point.trials) * 100
        : null,
    }));
  }, [data]);

  // Check if any percentage metric is visible (to show right axis)
  const showRightAxis = visibleMetrics.has('approvalRate');

  // Render legend (always visible)
  const legendContent = (
    <div className={styles.legend}>
      {Object.entries(METRIC_CONFIG).map(([key, config]) => {
        const metricKey = key as MetricKey;
        const isActive = visibleMetrics.has(metricKey);
        return (
          <button
            key={key}
            type="button"
            className={`${styles.legendItem} ${isActive ? styles.legendItemActive : ''} ${config.isArea ? styles.legendItemArea : ''}`}
            onClick={() => toggleMetric(metricKey)}
            style={{
              '--metric-color': config.color,
            } as React.CSSProperties}
          >
            <span className={`${styles.legendDot} ${config.isArea ? styles.legendDotArea : ''}`} />
            {config.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>Daily Metrics</div>
        {legendContent}
      </div>
      <div className={styles.chartWrapper}>
        {loading ? (
          <div style={{ height: CHART_HEIGHT }}><ChartSkeleton /></div>
        ) : error ? (
          <div className={styles.error} style={{ height: CHART_HEIGHT }}>{error}</div>
        ) : data.length === 0 ? (
          <div className={styles.empty} style={{ height: CHART_HEIGHT }}>No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart
              data={chartData}
              margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="approvalRateGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border, #e8eaed)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatXAxisDate}
                tick={{ fontSize: 12, fill: 'var(--color-text-secondary, #6b7280)' }}
                axisLine={{ stroke: 'var(--color-border, #e8eaed)' }}
                tickLine={false}
                dy={8}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12, fill: 'var(--color-text-secondary, #6b7280)' }}
                axisLine={false}
                tickLine={false}
                dx={-8}
                width={40}
              />
              {showRightAxis && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: 'var(--color-text-secondary, #6b7280)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value}%`}
                  width={45}
                />
              )}
              <Tooltip content={<CustomTooltip />} />

              {/* Render Area first (approval rate) so it appears behind lines */}
              {visibleMetrics.has('approvalRate') && (
                <Area
                  type="monotone"
                  dataKey="approvalRate"
                  name="Approval %"
                  yAxisId="right"
                  stroke="none"
                  fill="url(#approvalRateGradient)"
                  connectNulls
                />
              )}

              {/* Render Lines on top */}
              {Object.entries(METRIC_CONFIG).map(([key, config]) => {
                const metricKey = key as MetricKey;
                // Skip area metrics (handled above) and non-visible metrics
                if (config.isArea || !visibleMetrics.has(metricKey)) return null;
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={config.key}
                    name={config.label}
                    stroke={config.color}
                    strokeWidth={2}
                    yAxisId={config.yAxisId}
                    dot={{ r: 3, fill: config.color, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: config.color, strokeWidth: 0 }}
                    connectNulls
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
