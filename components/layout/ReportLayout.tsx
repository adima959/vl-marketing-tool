'use client';

import type { ReactNode } from 'react';

interface ReportLayoutProps {
  children: ReactNode;
}

export function ReportLayout({ children }: ReportLayoutProps) {
  return <>{children}</>;
}
