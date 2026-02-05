'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabItem[] = [
  {
    title: 'Users',
    href: '/settings/users',
    icon: Users,
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-[var(--color-border-light)] bg-white px-4">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition-colors relative -mb-px',
              isActive
                ? 'text-[var(--color-gray-900)] border-b-2 border-[var(--color-gray-900)]'
                : 'text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)] border-b-2 border-transparent'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.title}
          </Link>
        );
      })}
    </nav>
  );
}
