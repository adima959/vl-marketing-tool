'use client';

import { ProductStatus, PRODUCT_STATUS_CONFIG } from '@/types';
import { GenericStatusBadge } from '@/components/ui/GenericStatusBadge';

interface ProductStatusBadgeProps {
  status: ProductStatus;
  onChange?: (newStatus: ProductStatus) => void;
  editable?: boolean;
  size?: 'small' | 'default';
  variant?: 'tag' | 'dot';
}

export function ProductStatusBadge(props: ProductStatusBadgeProps) {
  return <GenericStatusBadge {...props} config={PRODUCT_STATUS_CONFIG} />;
}
