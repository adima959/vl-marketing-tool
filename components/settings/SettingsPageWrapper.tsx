'use client';

import { useAuth } from '@/contexts/AuthContext';
import { AuthErrorPage } from '@/components/auth/AuthErrorPage';
import { Spin } from 'antd';
import styles from '@/styles/components/settings.module.css';

/**
 * Settings Page Wrapper
 *
 * Handles authentication for settings pages.
 * Wraps page content and displays auth error UI when session is invalid.
 *
 * Usage:
 *   export default function MySettingsPage() {
 *     return (
 *       <SettingsPageWrapper>
 *         <MyPageContent />
 *       </SettingsPageWrapper>
 *     );
 *   }
 */

interface SettingsPageWrapperProps {
  /** Page content to render if authenticated */
  children: React.ReactNode;
}

export function SettingsPageWrapper({ children }: SettingsPageWrapperProps) {
  const { isAuthenticated, isLoading, authError } = useAuth();

  if (isLoading) {
    return (
      <div className={styles.centeredState}>
        <Spin size="small" />
      </div>
    );
  }

  if (!isAuthenticated || authError) {
    return <AuthErrorPage />;
  }

  return <>{children}</>;
}
