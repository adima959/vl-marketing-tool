import type { Metadata } from 'next';
import { SettingsShell } from '@/components/settings/SettingsShell';

export const metadata: Metadata = {
  title: {
    default: 'Settings',
    template: '%s - Settings',
  },
  description: 'Application settings and configuration',
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsShell>{children}</SettingsShell>;
}
