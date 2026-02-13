import { METRIC_CONFIG } from '@/config/dashboardChartMetrics';
import { formatTooltipDate } from '@/lib/utils/chartDateUtils';
import styles from './DashboardTimeSeriesChart.module.css';

interface TooltipPayloadEntry {
  dataKey?: string | number;
  name?: string;
  value?: number;
  color?: string;
  fill?: string;
  stroke?: string;
  payload?: Record<string, number | string | null>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

export function CustomTooltip({
  active,
  payload,
  label,
}: CustomTooltipProps): React.ReactElement | null {
  if (!active || !payload || !payload.length) {
    return null;
  }

  // Sort tooltip entries to match METRIC_CONFIG order
  const metricKeyOrder = Object.keys(METRIC_CONFIG);
  const sortedPayload = [...payload].sort((a, b) => {
    const aIdx = metricKeyOrder.indexOf(String(a.dataKey));
    const bIdx = metricKeyOrder.indexOf(String(b.dataKey));
    return aIdx - bIdx;
  });

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{formatTooltipDate(label || '')}</div>
      <div className={styles.tooltipMetrics}>
        {sortedPayload.map((entry) => {
          const metricConfig = Object.values(METRIC_CONFIG).find(
            (m) => m.key === entry.dataKey
          );
          const isPercentage = metricConfig?.isPercentage || false;
          const formattedValue = isPercentage
            ? `${entry.value?.toFixed(1)}%`
            : entry.value;
          const dotColor = entry.stroke || entry.color || entry.fill;

          return (
            <div key={entry.dataKey}>
              <div className={styles.tooltipRow}>
                <span
                  className={styles.tooltipDot}
                  style={{ backgroundColor: dotColor }}
                />
                <span className={styles.tooltipLabel}>{entry.name}</span>
                <span className={styles.tooltipValue}>{formattedValue}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
