'use client';

import { GenericDimensionPicker } from '@/components/shared/GenericDimensionPicker';
import { VALIDATION_RATE_DIMENSION_GROUPS } from '@/config/validationRateDimensions';
import type { ValidationRateStore } from '@/types';
import type { UseBoundStore, StoreApi } from 'zustand';

interface ValidationRateDimensionPickerProps {
  useStore: UseBoundStore<StoreApi<ValidationRateStore>>;
}

/**
 * Validation Rate dimension picker
 * Thin wrapper around GenericDimensionPicker with validation-rate-specific configuration
 */
export function ValidationRateDimensionPicker({ useStore }: ValidationRateDimensionPickerProps): React.ReactElement {
  const { dimensions, addDimension } = useStore();

  return (
    <GenericDimensionPicker
      variant="dropdown"
      dimensions={dimensions}
      addDimension={addDimension}
      dimensionGroups={VALIDATION_RATE_DIMENSION_GROUPS}
    />
  );
}
