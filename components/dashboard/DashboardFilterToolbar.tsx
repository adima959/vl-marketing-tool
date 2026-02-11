'use client';

import { GenericFilterToolbar } from '@/components/filters/GenericFilterToolbar';
import { DashboardDimensionPicker } from './DashboardDimensionPicker';
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
      dimensionPicker={<DashboardDimensionPicker />}
      canRemoveDimensions={true}
      styleModule={{
        filterBar: styles.filterBar,
        filterLeft: styles.filterLeft,
        filterRight: styles.filterRight,
        filterLabel: styles.filterLabel,
      }}
    />
  );
}
