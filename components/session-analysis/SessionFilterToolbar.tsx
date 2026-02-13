'use client';

import { GenericFilterToolbar } from '@/components/filters/GenericFilterToolbar';
import { SessionDimensionPicker } from './SessionDimensionPicker';
import { useSessionStore } from '@/stores/sessionStore';
import { getSessionDimensionLabel, SESSION_DIMENSION_GROUPS } from '@/config/sessionDimensions';
import type { TableFilter } from '@/types/filters';

interface SessionFilterToolbarProps {
  filters: TableFilter[];
  onFiltersChange: (filters: TableFilter[]) => void;
}

/**
 * Session analytics filter toolbar
 * Thin wrapper around GenericFilterToolbar with session-specific dimensions
 */
export function SessionFilterToolbar({ filters, onFiltersChange }: SessionFilterToolbarProps) {
  return (
    <GenericFilterToolbar
      useStore={useSessionStore}
      getLabel={getSessionDimensionLabel}
      dimensionPicker={<SessionDimensionPicker />}
      filterPanel={{
        filters,
        onFiltersChange,
        dimensionGroups: SESSION_DIMENSION_GROUPS,
      }}
      showUnsavedDot
    />
  );
}
