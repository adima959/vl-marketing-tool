'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { SETTINGS_PAGES } from '@/config/settings';

export default function SettingsPage() {
  const { isLoading, hasPermission } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const firstAccessible = SETTINGS_PAGES.find(
      (page) => hasPermission(page.featureKey, 'can_view')
    );

    router.replace(firstAccessible?.href ?? '/');
  }, [isLoading, hasPermission, router]);

  return null;
}
