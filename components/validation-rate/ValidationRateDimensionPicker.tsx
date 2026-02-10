'use client';

import { GenericDimensionPickerDropdown } from '@/components/shared/GenericDimensionPickerDropdown';
import { VALIDATION_RATE_DIMENSION_GROUPS } from '@/config/validationRateDimensions';
import type { ValidationRateStore } from '@/types';
import type { UseBoundStore, StoreApi } from 'zustand';

interface ValidationRateDimensionPickerProps {
  useStore: UseBoundStore<StoreApi<ValidationRateStore>>;
}

/**
 * Validation Rate dimension picker
 * Thin wrapper around GenericDimensionPickerDropdown with validation-rate-specific configuration
 */
export function ValidationRateDimensionPicker({ useStore }: ValidationRateDimensionPickerProps): React.ReactElement {
  const { dimensions, addDimension } = useStore();

  return (
    <GenericDimensionPickerDropdown
      dimensions={dimensions}
      addDimension={addDimension}
      dimensionGroups={VALIDATION_RATE_DIMENSION_GROUPS}
    />
  );
}
