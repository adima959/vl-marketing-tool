import { checkSettingsAuth } from '@/lib/server/settingsAuth';
import styles from '@/styles/components/settings.module.css';

/**
 * Settings Page Wrapper
 *
 * Handles authentication and authorization for settings pages.
 * Wraps page content and displays auth error messages when needed.
 *
 * Usage:
 *   export default async function MySettingsPage() {
 *     return (
 *       <SettingsPageWrapper requireAdmin>
 *         <MyPageContent />
 *       </SettingsPageWrapper>
 *     );
 *   }
 */

interface SettingsPageWrapperProps {
  /** If true, requires user to have admin role */
  requireAdmin?: boolean;
  /** Page content to render if authenticated */
  children: React.ReactNode;
}

export async function SettingsPageWrapper({
  requireAdmin,
  children,
}: SettingsPageWrapperProps) {
  const { isAuthenticated, message } = await checkSettingsAuth({ requireAdmin });

  if (!isAuthenticated || message) {
    return <div className={styles.authMessage}>{message}</div>;
  }

  return <>{children}</>;
}
