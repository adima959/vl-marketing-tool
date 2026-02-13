'use client';

import { ReactNode } from 'react';
import { useActiveHeartbeat } from '@/hooks/useActiveHeartbeat';

export function ActiveTimeTracker({ children }: { children: ReactNode }) {
  useActiveHeartbeat();
  return <>{children}</>;
}
