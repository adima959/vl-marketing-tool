'use client';

import { GenericDimensionPicker } from '@/components/shared/GenericDimensionPicker';
import { MARKETING_DIMENSION_GROUPS } from '@/config/marketingDimensions';
import { useReportStore } from '@/stores/reportStore';

/**
 * Marketing Report dimension picker
 * Thin wrapper around GenericDimensionPicker with marketing-specific configuration
 */
export function DimensionPicker(): React.ReactElement {
  const { dimensions, addDimension } = useReportStore();

  return (
    <GenericDimensionPicker
      variant="dropdown"
      dimensions={dimensions}
      addDimension={addDimension}
      dimensionGroups={MARKETING_DIMENSION_GROUPS}
    />
  );
}
