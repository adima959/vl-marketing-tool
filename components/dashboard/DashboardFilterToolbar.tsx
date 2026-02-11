'use client';

import { GenericFilterToolbar } from '@/components/filters/GenericFilterToolbar';
import { useDashboardStore } from '@/stores/dashboardStore';
import { getCrmDimensionLabel } from '@/config/crmDimensions';
import styles from './dashboard.module.css';

/**
 * Dashboard filter toolbar
 * Thin wrapper around GenericFilterToolbar with dashboard-specific configuration
 */
export function DashboardFilterToolbar() {
  return (
    <GenericFilterToolbar
      useStore={useDashboardStore}
      getLabel={getCrmDimensionLabel}
      canRemoveDimensions={false}
      styleModule={{
        filterBar: styles.filterBar,
        filterLeft: styles.filterLeft,
        filterRight: styles.filterRight,
        filterLabel: styles.filterLabel,
      }}
    />
  );
}
