'use client';

import { useState, useEffect } from 'react';
import { Spin } from 'antd';
import { SettingsPageWrapper } from '@/components/settings/SettingsPageWrapper';
import { UsersClientTable } from '@/components/settings/UsersClientTable';
import type { AppUser } from '@/types/user';
import styles from '@/styles/components/settings.module.css';

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setUsers(data.data || []))
      .catch(err => console.error('Failed to load users:', err))
      .finally(() => setLoading(false));
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
