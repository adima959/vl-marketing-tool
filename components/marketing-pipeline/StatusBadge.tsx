'use client';

import { AngleStatus, STATUS_CONFIG } from '@/types';
import { GenericStatusBadge } from '@/components/ui/GenericStatusBadge';

interface StatusBadgeProps {
  status: AngleStatus;
  onChange?: (newStatus: AngleStatus) => void;
  editable?: boolean;
  size?: 'small' | 'default';
  variant?: 'tag' | 'dot';
}

export function StatusBadge(props: StatusBadgeProps) {
  return <GenericStatusBadge {...props} config={STATUS_CONFIG} />;
}
