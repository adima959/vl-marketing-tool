'use client';

import { useState, useEffect, useCallback } from 'react';
import { Spin } from 'antd';
import { SettingsPageWrapper } from '@/components/settings/SettingsPageWrapper';
import { UsersClientTable } from '@/components/settings/UsersClientTable';
import { AccessDenied } from '@/components/AccessDenied';
import { useAuth } from '@/contexts/AuthContext';
import type { AppUser } from '@/types/user';
import styles from '@/styles/components/settings.module.css';
import { checkAuthError } from '@/lib/api/errorHandler';

export default function UsersPage() {
  const { hasPermission, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      checkAuthError(res);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (authLoading) {
    return <div className={styles.centeredState}><Spin size="small" /></div>;
  }

  if (!hasPermission('admin.user_management', 'can_view')) {
    return <AccessDenied feature="User Management" />;
  }

  return (
    <SettingsPageWrapper>
      {loading ? (
        <div className={styles.centeredState}>
          <Spin size="small" />
        </div>
      ) : (
        <UsersClientTable users={users} onRefresh={fetchUsers} />
      )}
    </SettingsPageWrapper>
  );
}
