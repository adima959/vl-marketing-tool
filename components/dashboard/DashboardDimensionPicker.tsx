'use client';

import { GenericDimensionPickerDropdown } from '@/components/shared/GenericDimensionPickerDropdown';
import { DASHBOARD_DIMENSION_GROUPS } from '@/config/dashboardDimensions';
import { useDashboardStore } from '@/stores/dashboardStore';

/**
 * Dashboard dimension picker
 * Thin wrapper around GenericDimensionPickerDropdown with dashboard-specific configuration
 */
export function DashboardDimensionPicker(): React.ReactElement {
  const { dimensions, addDimension } = useDashboardStore();

  return (
    <GenericDimensionPickerDropdown
      dimensions={dimensions}
      addDimension={addDimension}
      dimensionGroups={DASHBOARD_DIMENSION_GROUPS}
    />
  );
}
