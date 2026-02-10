'use client';

import { GenericDimensionPickerDropdown } from '@/components/shared/GenericDimensionPickerDropdown';
import { CRM_DIMENSION_GROUPS } from '@/config/crmDimensions';
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
      dimensionGroups={CRM_DIMENSION_GROUPS}
    />
  );
}
