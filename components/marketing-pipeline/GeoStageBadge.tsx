'use client';

import { GenericStatusBadge } from '@/components/ui/GenericStatusBadge';
import type { GeoStage } from '@/types';
import { GEO_STAGE_CONFIG } from '@/types';

interface GeoStageBadgeProps {
  stage: GeoStage;
  onChange?: (newStage: GeoStage) => void;
  editable?: boolean;
  size?: 'small' | 'default';
}

export function GeoStageBadge({
  stage,
  onChange,
  editable = false,
  size = 'default',
}: GeoStageBadgeProps) {
  return (
    <GenericStatusBadge
      status={stage}
      config={GEO_STAGE_CONFIG}
      onChange={onChange}
      editable={editable}
      size={size}
      fontWeight={600}
    />
  );
}
