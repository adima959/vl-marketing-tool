'use client';

import type { ReactNode } from 'react';
import { GenericFilterToolbar } from '@/components/filters/GenericFilterToolbar';
import { DashboardDimensionPicker } from './DashboardDimensionPicker';
import { getDashboardDimensionLabel } from '@/config/dashboardDimensions';
import { useDashboardStore } from '@/stores/dashboardStore';

interface DashboardFilterToolbarProps {
  infoBanner?: ReactNode;
}

export function DashboardFilterToolbar({ infoBanner }: DashboardFilterToolbarProps) {
  return (
    <GenericFilterToolbar
      useStore={useDashboardStore}
      getLabel={getDashboardDimensionLabel}
      dimensionPicker={<DashboardDimensionPicker />}
      infoBanner={infoBanner}
      showUnsavedDot
    />
  );
}
