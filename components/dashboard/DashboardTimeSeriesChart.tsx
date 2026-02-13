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
import type { MetricClickContext } from '@/types/dashboardDetails';
import { fetchDashboardTimeSeries } from '@/lib/api/dashboardClient';
import { METRIC_CONFIG, type MetricKey } from '@/config/dashboardChartMetrics';
import { getLast14DaysRange, parseLocalDate, formatXAxisDate } from '@/lib/utils/chartDateUtils';
import { CustomTooltip } from './ChartTooltip';
import { ChartSkeleton } from './ChartSkeleton';
import { CrmDetailModal } from '@/components/modals/CrmDetailModal';
import styles from './DashboardTimeSeriesChart.module.css';

const CHART_HEIGHT = 300;

/**
 * Extended data point with calculated approval rate
 */
interface ChartDataPoint extends TimeSeriesDataPoint {
  approvalRate: number | null;
}

/** Build the default set of visible metrics from config */
function getDefaultVisibleMetrics(): Set<MetricKey> {
  const defaults = new Set<MetricKey>();
  for (const [key, config] of Object.entries(METRIC_CONFIG)) {
    if (config.defaultVisible) defaults.add(key as MetricKey);
  }
  return defaults;
}

/**
 * Dashboard time series chart showing daily metrics for the last 14 days
 * Always shows 14 days regardless of table date range selection
 */
export function DashboardTimeSeriesChart(): React.ReactElement {
  const [data, setData] = useState<TimeSeriesDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleMetrics, setVisibleMetrics] = useState<Set<MetricKey>>(getDefaultVisibleMetrics);

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

  // Detail modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<MetricClickContext | null>(null);

  const handlePointClick = useCallback((metricKey: MetricKey, payload: ChartDataPoint) => {
    if (metricKey === 'approvalRate') return;
    const config = METRIC_CONFIG[metricKey];
    const date = parseLocalDate(payload.date);
    setModalContext({
      metricId: metricKey as MetricClickContext['metricId'],
      metricLabel: config.label,
      value: payload[metricKey] as number,
      filters: {
        dateRange: { start: date, end: date },
        excludeUpsellTags: true,
      },
    });
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setModalContext(null);
  }, []);

  // Memoize chart data with calculated approval rate
  const chartData = useMemo((): ChartDataPoint[] => {
    return data.map((point) => ({
      ...point,
      // Trial approval rate: trialsApproved / subscriptions
      approvalRate: point.subscriptions > 0
        ? (point.trialsApproved / point.subscriptions) * 100
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
                  name="Trial Appr. %"
                  yAxisId="right"
                  stroke="none"
                  fill="url(#approvalRateGradient)"
                  connectNulls
                />
              )}

              {/* Render Lines on top — dots are clickable to open detail modal */}
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
                    dot={{ r: 3, fill: config.color, strokeWidth: 0, cursor: 'pointer' }}
                    activeDot={(props: { cx?: number; cy?: number; payload?: ChartDataPoint }) => {
                      const { cx, cy, payload } = props;
                      if (cx == null || cy == null || !payload) return null;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={5}
                          fill={config.color}
                          strokeWidth={0}
                          cursor="pointer"
                          onClick={() => handlePointClick(metricKey, payload)}
                        />
                      );
                    }}
                    connectNulls
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <CrmDetailModal
        open={modalOpen}
        onClose={handleModalClose}
        variant="dashboard"
        context={modalContext}
      />
    </div>
  );
}
