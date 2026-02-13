import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { validateRequest } from '@/lib/auth';
import { UserRole, type AppUser } from '@/types/user';
import type { FeatureKey, PermissionAction, RolePermission } from '@/types/roles';
import { getPermissionsByRoleId } from '@/lib/roles/db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Gets user from database by CRM user ID
 * @param externalId - The CRM user ID
 * @returns AppUser or null
 */
export async function getUserByExternalId(externalId: string): Promise<AppUser | null> {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      'SELECT * FROM app_users WHERE external_id = $1 AND deleted_at IS NULL',
      [externalId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0] as AppUser;
  } finally {
    client.release();
  }
}

/**
 * Gets user from database by email
 * @param email - User email
 * @returns AppUser or null
 */
export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      'SELECT * FROM app_users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0] as AppUser;
  } finally {
    client.release();
  }
}

/**
 * Gets user from request by validating auth token and fetching from database
 * @param request - Next.js request
 * @returns AppUser or null
 */
export async function getUserFromRequest(request: NextRequest): Promise<AppUser | null> {
  // Validate auth token
  const { valid, user: crmUser } = await validateRequest(request);
  
  if (!valid || !crmUser) {
    return null;
  }
  
  // Get user from database
  return await getUserByExternalId(crmUser.id);
}

/**
 * Checks if user has required role
 * @param user - App user
 * @param requiredRole - Required role
 * @returns true if user has required role or higher
 */
export function hasRole(user: AppUser | null, requiredRole: UserRole): boolean {
  if (!user) {
    return false;
  }
  
  // Admin has all permissions
  if (user.role === UserRole.ADMIN) {
    return true;
  }
  
  // Check specific role
  return user.role === requiredRole;
}

/**
 * Checks if user is admin
 * @param user - App user
 * @returns true if user is admin
 */
export function isAdmin(user: AppUser | null): boolean {
  return user?.role === UserRole.ADMIN;
}

/**
 * Higher-order function to protect API routes with role-based access control
 * Similar to withAuth but also checks user role from database
 *
 * Usage:
 * export const GET = withRole(UserRole.ADMIN, async (request, user) => {
 *   // user is guaranteed to be authenticated and have admin role
 *   return NextResponse.json({ data: 'admin only' });
 * });
 */
export function withRole<TArgs extends unknown[]>(
  requiredRole: UserRole,
  handler: (request: NextRequest, user: AppUser, ...args: TArgs) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: TArgs): Promise<NextResponse> => {
    // Get user from request
    const user = await getUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Authentication required' },
        { status: 401 }
      );
    }
    
    // Check role
    if (!hasRole(user, requiredRole)) {
      return NextResponse.json(
        { error: 'Forbidden - Insufficient permissions' },
        { status: 403 }
      );
    }
    
    return handler(request, user, ...args);
  };
}

/**
 * Higher-order function to protect API routes requiring authentication only (any role).
 * Use for data/report endpoints accessible to all authenticated users.
 */
export function withAuth<TArgs extends unknown[]>(
  handler: (request: NextRequest, user: AppUser, ...args: TArgs) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: TArgs): Promise<NextResponse> => {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Authentication required' },
        { status: 401 }
      );
    }

    return handler(request, user, ...args);
  };
}

/**
 * Shorthand for admin-only routes
 */
export function withAdmin<TArgs extends unknown[]>(
  handler: (request: NextRequest, user: AppUser, ...args: TArgs) => Promise<NextResponse>
) {
  return withRole(UserRole.ADMIN, handler);
}

// ============================================================================
// Permission-based access control (Phase 2 RBAC)
// ============================================================================

const ACTION_TO_FIELD: Record<PermissionAction, keyof Pick<RolePermission, 'canView' | 'canCreate' | 'canEdit' | 'canDelete'>> = {
  can_view: 'canView',
  can_create: 'canCreate',
  can_edit: 'canEdit',
  can_delete: 'canDelete',
};

/**
 * Checks if a user has a specific permission on a feature.
 * Admin users always pass. Users without role_id get view-only access.
 */
async function checkUserPermission(
  user: AppUser,
  featureKey: FeatureKey,
  action: PermissionAction
): Promise<boolean> {
  if (user.role === UserRole.ADMIN) return true;

  if (!user.role_id) {
    return action === 'can_view';
  }

  const permissions = await getPermissionsByRoleId(user.role_id);
  const perm = permissions.find(p => p.featureKey === featureKey);
  if (!perm) return false;

  return Boolean(perm[ACTION_TO_FIELD[action]]);
}

/**
 * Higher-order function to protect API routes with feature-level permissions.
 *
 * Usage:
 * export const GET = withPermission('analytics.dashboard', 'can_view', async (request, user) => {
 *   return NextResponse.json({ data: '...' });
 * });
 */
export function withPermission<TArgs extends unknown[]>(
  featureKey: FeatureKey,
  action: PermissionAction,
  handler: (request: NextRequest, user: AppUser, ...args: TArgs) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: TArgs): Promise<NextResponse> => {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Authentication required' },
        { status: 401 }
      );
    }

    const allowed = await checkUserPermission(user, featureKey, action);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden - You do not have permission to access this resource' },
        { status: 403 }
      );
    }

    return handler(request, user, ...args);
  };
}
