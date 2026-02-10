'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { SETTINGS_PAGES } from '@/config/settings';
import styles from './SettingsNav.module.css';

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {SETTINGS_PAGES.map((page) => {
        const isActive = pathname === page.href;
        const Icon = page.icon;
        return (
          <Link
            key={page.href}
            href={page.href}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
          >
            <Icon className={styles.tabIcon} />
            {page.title}
          </Link>
        );
      })}
    </nav>
  );
}
