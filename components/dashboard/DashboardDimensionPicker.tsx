'use client';

import { GenericDimensionPicker } from '@/components/shared/GenericDimensionPicker';
import { DASHBOARD_DIMENSION_GROUPS } from '@/config/dashboardDimensions';
import { useDashboardStore } from '@/stores/dashboardStore';

export function DashboardDimensionPicker(): React.ReactElement {
  const { dimensions, addDimension } = useDashboardStore();

  return (
    <GenericDimensionPicker
      variant="dropdown"
      dimensions={dimensions}
      addDimension={addDimension}
      dimensionGroups={DASHBOARD_DIMENSION_GROUPS}
    />
  );
}
