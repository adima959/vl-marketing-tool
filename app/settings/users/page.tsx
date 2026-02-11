'use client';

import { useState, useEffect } from 'react';
import { Spin } from 'antd';
import { SettingsPageWrapper } from '@/components/settings/SettingsPageWrapper';
import { UsersClientTable } from '@/components/settings/UsersClientTable';
import type { AppUser } from '@/types/user';
import styles from '@/styles/components/settings.module.css';
import { checkAuthError } from '@/lib/api/errorHandler';

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch('/api/users');
        checkAuthError(res);
        const data = await res.json();
        setUsers(data.data || []);
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <SettingsPageWrapper>
      {loading ? (
        <div className={styles.centeredState}>
          <Spin size="small" />
        </div>
      ) : (
        <UsersClientTable users={users} />
      )}
    </SettingsPageWrapper>
  );
}
