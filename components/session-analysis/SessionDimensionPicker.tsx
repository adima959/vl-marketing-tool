'use client';

import { GenericDimensionPicker } from '@/components/shared/GenericDimensionPicker';
import { SESSION_DIMENSION_GROUPS } from '@/config/sessionDimensions';
import { useSessionStore } from '@/stores/sessionStore';

const GROUP_COLORS: Record<string, string> = {
  content: '#3b82f6',        // Blue - what they landed on
  trafficSource: '#f59e0b',  // Orange - how they got there
  audience: '#8b5cf6',       // Purple - who they are
};

/**
 * Session analytics dimension picker
 * Thin wrapper around GenericDimensionPicker with session-specific configuration
 */
export function SessionDimensionPicker(): React.ReactElement {
  const { dimensions, addDimension } = useSessionStore();

  return (
    <GenericDimensionPicker
      dimensions={dimensions}
      addDimension={addDimension}
      dimensionGroups={SESSION_DIMENSION_GROUPS}
      groupColors={GROUP_COLORS}
    />
  );
}
