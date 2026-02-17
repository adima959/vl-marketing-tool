'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DailyAggregate } from '@/types/sales';
import styles from './DashboardTimeSeriesChart.module.css';

/**
 * Metric configuration — key order controls legend & tooltip order.
 * Colors from project memory (confirmed design).
 */
const METRIC_CONFIG = {
  customers:      { label: 'Customers',      color: '#8b5cf6', type: 'line' as const, defaultEnabled: false },
  subscriptions:  { label: 'Subscriptions',  color: '#3b82f6', type: 'line' as const, defaultEnabled: true },
  trialsApproved: { label: 'Trials',         color: '#00B96B', type: 'line' as const, defaultEnabled: true },
  onHold:         { label: 'On Hold',        color: '#ef4444', type: 'line' as const, defaultEnabled: false },
  approvalRate:   { label: 'Trial Appr. %',  color: '#10b981', type: 'area' as const, defaultEnabled: true },
  upsells:        { label: 'Upsells',        color: '#d97706', type: 'line' as const, defaultEnabled: true },
  ots:            { label: 'OTS',            color: '#7c8db5', type: 'line' as const, defaultEnabled: true },
} as const;

type MetricKey = keyof typeof METRIC_CONFIG;
const METRIC_KEYS = Object.keys(METRIC_CONFIG) as MetricKey[];
const CHART_HEIGHT = 300;

function formatDateLong(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function formatTooltipValue(key: MetricKey, value: number): string {
  if (key === 'approvalRate') return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
  enabledMetrics: Set<MetricKey>;
}

function ChartTooltip({ active, payload, label, enabledMetrics }: ChartTooltipProps) {
  if (!active || !payload?.length || !label) return null;

  const dataMap = new Map(payload.map((p) => [p.dataKey, p.value]));

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{formatDateLong(label)}</div>
      <div className={styles.tooltipMetrics}>
        {METRIC_KEYS.filter((k) => enabledMetrics.has(k)).map((key) => {
          const cfg = METRIC_CONFIG[key];
          const val = dataMap.get(key);
          if (val === undefined) return null;
          return (
            <div key={key} className={styles.tooltipRow}>
              <span className={styles.tooltipLabel}>
                <span className={styles.tooltipDot} style={{ background: cfg.color }} />
                {cfg.label}
              </span>
              <span className={styles.tooltipValue}>{formatTooltipValue(key, val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DashboardTimeSeriesChartProps {
  data: DailyAggregate[];
  isLoading?: boolean;
}

export function DashboardTimeSeriesChart({ data, isLoading }: DashboardTimeSeriesChartProps) {
  const [enabledMetrics, setEnabledMetrics] = useState<Set<MetricKey>>(() => {
    const initial = new Set<MetricKey>();
    for (const key of METRIC_KEYS) {
      if (METRIC_CONFIG[key].defaultEnabled) initial.add(key);
    }
    return initial;
  });

  const toggleMetric = useCallback((key: MetricKey) => {
    setEnabledMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const showRightAxis = enabledMetrics.has('approvalRate');

  // Scale approval rate from 0-1 to 0-100 for the percentage axis
  const chartData = useMemo(
    () => data.map((d) => ({ ...d, approvalRate: d.approvalRate * 100 })),
    [data],
  );

  if (isLoading && data.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>14-Day Overview</span>
        </div>
        <div className={styles.skeleton}>
          <div className={styles.skeletonYAxis}>
            {[100, 75, 50, 25, 0].map((tick) => (
              <div key={tick} className={styles.skeletonTick} />
            ))}
          </div>
          <div className={styles.skeletonContent}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.skeletonGridLine} />
            ))}
            <div className={styles.skeletonLine} />
          </div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>14-Day Overview</span>
        </div>
        <div className={styles.emptyChart}>Load data to see the chart</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>14-Day Overview</span>
        <div className={styles.legend}>
          {METRIC_KEYS.map((key) => {
            const cfg = METRIC_CONFIG[key];
            const isEnabled = enabledMetrics.has(key);
            return (
              <button
                key={key}
                type="button"
                className={`${styles.legendItem} ${isEnabled ? styles.legendItemActive : ''}`}
                style={isEnabled ? { borderColor: cfg.color } : undefined}
                onClick={() => toggleMetric(key)}
              >
                {cfg.type === 'area' ? (
                  <span
                    className={styles.legendDotArea}
                    style={{ background: `linear-gradient(180deg, ${cfg.color}40 0%, ${cfg.color}15 100%)`, borderColor: cfg.color }}
                  />
                ) : (
                  <span
                    className={styles.legendDot}
                    style={{ background: cfg.color, opacity: isEnabled ? 1 : 0.4 }}
                  />
                )}
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="approvalRateGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-100)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            tick={{ fontSize: 11, fill: 'var(--color-gray-400)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: 'var(--color-gray-400)' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          {showRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: 'var(--color-gray-400)' }}
              tickFormatter={(v: number) => `${v}%`}
              axisLine={false}
              tickLine={false}
              width={45}
            />
          )}
          <RechartsTooltip
            content={<ChartTooltip enabledMetrics={enabledMetrics} />}
            cursor={{ stroke: 'var(--color-gray-300)', strokeDasharray: '4 4' }}
          />

          {/* Render area first (behind lines) */}
          {enabledMetrics.has('approvalRate') && (
            <Area
              dataKey="approvalRate"
              stroke="none"
              fill="url(#approvalRateGradient)"
              type="monotone"
              yAxisId="right"
              connectNulls
            />
          )}

          {/* Render lines */}
          {METRIC_KEYS.map((key) => {
            if (!enabledMetrics.has(key)) return null;
            const cfg = METRIC_CONFIG[key];
            if (cfg.type !== 'line') return null;

            return (
              <Line
                key={key}
                dataKey={key}
                stroke={cfg.color}
                strokeWidth={2}
                dot={{ r: 3, fill: cfg.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                type="monotone"
                yAxisId="left"
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
