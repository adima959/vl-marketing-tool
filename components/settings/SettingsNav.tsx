'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Users, Package, Map, Shield } from 'lucide-react';
import styles from './SettingsNav.module.css';

interface TabItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabItem[] = [
  { title: 'Users', href: '/settings/users', icon: Users },
  { title: 'Products', href: '/settings/products', icon: Package },
  { title: 'Data Maps', href: '/settings/data-maps', icon: Map },
  { title: 'Permissions', href: '/settings/permissions', icon: Shield },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
          >
            <Icon className={styles.tabIcon} />
            {tab.title}
          </Link>
        );
      })}
    </nav>
  );
}
