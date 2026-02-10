'use client';

import { PipelineStage, PIPELINE_STAGE_CONFIG } from '@/types';
import { GenericStatusBadge } from '@/components/ui/GenericStatusBadge';

interface PipelineStageBadgeProps {
  stage: PipelineStage;
  onChange?: (newStage: PipelineStage) => void;
  editable?: boolean;
  size?: 'small' | 'default';
}

export function PipelineStageBadge({
  stage,
  onChange,
  editable,
  size,
}: PipelineStageBadgeProps) {
  return (
    <GenericStatusBadge
      status={stage}
      config={PIPELINE_STAGE_CONFIG}
      onChange={onChange}
      editable={editable}
      size={size}
      fontWeight={600}
    />
  );
}
