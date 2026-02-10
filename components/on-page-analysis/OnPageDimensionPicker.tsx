'use client';

import { GenericDimensionPicker } from '@/components/shared/GenericDimensionPicker';
import { ON_PAGE_DIMENSION_GROUPS } from '@/config/onPageDimensions';
import { useOnPageStore } from '@/stores/onPageStore';

const GROUP_COLORS: Record<string, string> = {
  content: '#3b82f6',    // Blue - what they viewed
  source: '#f59e0b',     // Orange - how they got there
  audience: '#8b5cf6',   // Purple - who they are
  time: '#10b981',       // Green - when
};

/**
 * On-Page Analysis dimension picker
 * Thin wrapper around GenericDimensionPicker with on-page-specific configuration
 */
export function OnPageDimensionPicker(): React.ReactElement {
  const { dimensions, addDimension } = useOnPageStore();

  return (
    <GenericDimensionPicker
      dimensions={dimensions}
      addDimension={addDimension}
      dimensionGroups={ON_PAGE_DIMENSION_GROUPS}
      groupColors={GROUP_COLORS}
    />
  );
}
