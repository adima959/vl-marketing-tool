'use client';

import { GenericFilterToolbar } from '@/components/filters/GenericFilterToolbar';
import { DashboardDimensionPicker } from './DashboardDimensionPicker';
import { getDashboardDimensionLabel } from '@/config/dashboardDimensions';
import { useDashboardStore } from '@/stores/dashboardStore';

export function DashboardFilterToolbar() {
  return (
    <GenericFilterToolbar
      useStore={useDashboardStore}
      getLabel={getDashboardDimensionLabel}
      dimensionPicker={<DashboardDimensionPicker />}
      showUnsavedDot
    />
  );
}
