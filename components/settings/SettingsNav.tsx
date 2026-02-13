'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { SETTINGS_PAGES } from '@/config/settings';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUnclassifiedCount as fetchCampaignCount } from '@/lib/api/campaignClassificationsClient';
import { fetchUnclassifiedCount as fetchUrlCount } from '@/lib/api/urlClassificationsClient';
import badgeStyles from '@/styles/components/badge.module.css';
import styles from './SettingsNav.module.css';

export function SettingsNav() {
  const pathname = usePathname();
  const { hasPermission } = useAuth();
  const [totalUnclassified, setTotalUnclassified] = useState<number | null>(null);

  const visiblePages = useMemo(() => {
    return SETTINGS_PAGES.filter((page) => hasPermission(page.featureKey, 'can_view'));
  }, [hasPermission]);

  useEffect(() => {
    Promise.all([
      fetchCampaignCount().catch(() => 0),
      fetchUrlCount().catch(() => 0),
    ]).then(([campaigns, urls]) => {
      setTotalUnclassified(campaigns + urls);
    });
  }, []);

  return (
    <nav className={styles.nav}>
      {visiblePages.map((page) => {
        const isActive = pathname === page.href || pathname.startsWith(page.href + '/');
        const Icon = page.icon;
        return (
          <Link
            key={page.href}
            href={page.href}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
          >
            <Icon className={styles.tabIcon} />
            {page.title}
            {page.id === 'data-maps' && totalUnclassified != null && totalUnclassified > 0 && (
              <span className={badgeStyles.countBadge}>{totalUnclassified}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
