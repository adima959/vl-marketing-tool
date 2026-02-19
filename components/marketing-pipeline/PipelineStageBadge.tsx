'use client';

import { PipelineStage, PIPELINE_STAGE_CONFIG } from '@/types';
import { GenericStatusBadge } from '@/components/ui/GenericStatusBadge';

interface PipelineStageBadgeProps {
  stage: PipelineStage;
  onChange?: (newStage: PipelineStage) => void;
  editable?: boolean;
  size?: 'small' | 'default';
  variant?: 'tag' | 'dot';
}

export function PipelineStageBadge({
  stage,
  onChange,
  editable,
  size,
  variant = 'tag',
}: PipelineStageBadgeProps) {
  return (
    <GenericStatusBadge
      status={stage}
      config={PIPELINE_STAGE_CONFIG}
      onChange={onChange}
      editable={editable}
      size={size}
      variant={variant}
      fontWeight={600}
    />
  );
}
