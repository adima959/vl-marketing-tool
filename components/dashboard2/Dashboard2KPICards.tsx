'use client';

import { useMemo } from 'react';
import { useDashboardStore } from '@/stores/dashboardStore';
import type { DashboardRow } from '@/types/dashboard';
import styles from './dashboard2.module.css';

type CountMetricKey = 'customers' | 'subscriptions' | 'trials' | 'trialsApproved' | 'upsells';

interface KPIConfig {
  id: string;
  label: string;
  metricKey: CountMetricKey;
}

const KPI_CONFIGS: KPIConfig[] = [
  { id: 'customers', label: 'Customers', metricKey: 'customers' },
  { id: 'subscriptions', label: 'Subscriptions', metricKey: 'subscriptions' },
  { id: 'trials', label: 'Trials', metricKey: 'trials' },
  { id: 'trialsApproved', label: 'Approved', metricKey: 'trialsApproved' },
  { id: 'upsells', label: 'Upsells', metricKey: 'upsells' },
];

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 10000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString('en-US');
}

export function Dashboard2KPICards() {
  const { reportData, isLoading, hasLoadedOnce, sortColumn } = useDashboardStore();

  // Sum top-level rows (depth 0) for totals
  const totals = useMemo(() => {
    if (!reportData || reportData.length === 0) {
      return { customers: 0, subscriptions: 0, trials: 0, trialsApproved: 0, upsells: 0 };
    }
    return reportData.reduce(
      (acc, row) => {
        acc.customers += row.metrics.customers ?? 0;
        acc.subscriptions += row.metrics.subscriptions ?? 0;
        acc.trials += row.metrics.trials ?? 0;
        acc.trialsApproved += row.metrics.trialsApproved ?? 0;
        acc.upsells += row.metrics.upsells ?? 0;
        return acc;
      },
      { customers: 0, subscriptions: 0, trials: 0, trialsApproved: 0, upsells: 0 }
    );
  }, [reportData]);

  const showLoading = isLoading && !hasLoadedOnce;

  return (
    <div className={styles.kpiRow}>
      {KPI_CONFIGS.map((kpi) => {
        const value = totals[kpi.metricKey];
        const isActive = sortColumn === kpi.id;

        return (
          <div
            key={kpi.id}
            className={`${styles.kpiCard} ${isActive ? styles.kpiCardActive : ''}`}
          >
            <span className={styles.kpiLabel}>{kpi.label}</span>
            {showLoading ? (
              <div className={styles.kpiValueLoading} />
            ) : (
              <span className={`${styles.kpiValue} ${!hasLoadedOnce ? styles.emptyKpi : ''}`}>
                {hasLoadedOnce ? formatNumber(value) : '—'}
              </span>
            )}
            <div className={styles.kpiAccent} />
          </div>
        );
      })}
    </div>
  );
}
