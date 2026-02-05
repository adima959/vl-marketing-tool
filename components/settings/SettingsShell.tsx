'use client';

import { Settings } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsNav } from '@/components/settings/SettingsNav';

export function SettingsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <PageHeader
        title="Settings"
        icon={<Settings className="h-5 w-5" />}
      />
      <SettingsNav />
      <main className="flex-1 overflow-auto bg-[var(--color-background-secondary)]">
        {children}
      </main>
    </div>
  );
}
