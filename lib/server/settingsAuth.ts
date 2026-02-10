import { cookies } from 'next/headers';
import { validateTokenFromDatabase } from '@/lib/auth';
import { getUserByExternalId } from '@/lib/rbac';

/**
 * Settings Pages Authentication Utility
 *
 * Shared authentication logic for all settings pages.
 * Validates session token and checks user permissions.
 *
 * Usage:
 *   const auth = await checkSettingsAuth({ requireAdmin: true });
 *   if (!auth.isAuthenticated) return <AuthMessage message={auth.message} />;
 */

export interface SettingsAuthResult {
  isAuthenticated: boolean;
  isAdmin: boolean;
  message?: string;
}

export interface CheckAuthOptions {
  requireAdmin?: boolean;
}

/**
 * Check authentication and authorization for settings pages
 *
 * @param options - Optional configuration
 * @param options.requireAdmin - If true, requires user to have admin role
 * @returns Authentication result with status and optional error message
 */
export async function checkSettingsAuth(options?: CheckAuthOptions): Promise<SettingsAuthResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get('crm_auth_token');

  // No token present
  if (!token) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      message: 'Please log in to access this page.',
    };
  }

  // Validate token against database
  const { valid, user: crmUser } = await validateTokenFromDatabase(token.value);
  if (!valid || !crmUser) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      message: 'Please log in to access this page.',
    };
  }

  // Get app user by CRM user ID
  const user = await getUserByExternalId(crmUser.id);
  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin';

  // User not found in app database
  if (!isAuthenticated) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      message: 'Please log in to access this page.',
    };
  }

  // Check admin requirement
  if (options?.requireAdmin && !isAdmin) {
    return {
      isAuthenticated: true,
      isAdmin: false,
      message: 'You do not have permission to view this page.',
    };
  }

  // Success
  return {
    isAuthenticated: true,
    isAdmin,
  };
}
