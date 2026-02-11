'use client';

import { GenericDimensionPicker } from '@/components/shared/GenericDimensionPicker';
import { CRM_DIMENSION_GROUPS } from '@/config/crmDimensions';
import { useDashboardStore } from '@/stores/dashboardStore';

/**
 * Dashboard dimension picker
 * Thin wrapper around GenericDimensionPicker with dashboard-specific configuration
 */
export function DashboardDimensionPicker(): React.ReactElement {
  const { dimensions, addDimension } = useDashboardStore();

  return (
    <GenericDimensionPicker
      variant="dropdown"
      dimensions={dimensions}
      addDimension={addDimension}
      dimensionGroups={CRM_DIMENSION_GROUPS}
    />
  );
}
