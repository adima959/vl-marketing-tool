'use client';

import { GenericDimensionPicker } from '@/components/shared/GenericDimensionPicker';
import { MARKETING_DIMENSION_GROUPS } from '@/config/marketingDimensions';
import { useReportStore } from '@/stores/reportStore';

const GROUP_COLORS: Record<string, string> = {
  advertising: '#f59e0b',
  general: '#10b981',
  pages: '#3b82f6',
  visitor: '#8b5cf6',
  geo: '#06b6d4',
  device: '#ec4899',
  orders: '#f97316',
  crm: '#8b5cf6',
  classification: '#3b82f6',
};

/**
 * Marketing Report dimension picker
 * Thin wrapper around GenericDimensionPicker with marketing-specific configuration
 */
export function DimensionPicker(): React.ReactElement {
  const { dimensions, addDimension } = useReportStore();

  return (
    <GenericDimensionPicker
      dimensions={dimensions}
      addDimension={addDimension}
      dimensionGroups={MARKETING_DIMENSION_GROUPS}
      groupColors={GROUP_COLORS}
    />
  );
}
