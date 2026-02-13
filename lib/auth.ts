import type { AuthValidationResponse, CRMUser, PermissionMap } from '@/types/auth';
import type { AppUser } from '@/types/user';
import { UserRole } from '@/types/user';
import { FEATURES } from '@/types/roles';
import type { FeatureKey, PermissionAction } from '@/types/roles';
import { Pool } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Environment variables
const CRM_BASE_URL = process.env.CRM_BASE_URL || 'https://vitaliv.no/admin';
const CRM_VALIDATE_ENDPOINT = process.env.CRM_VALIDATE_ENDPOINT || '/site/marketing';
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'crm_auth_token';
const AUTH_COOKIE_MAX_AGE = parseInt(process.env.AUTH_COOKIE_MAX_AGE || '86400', 10);

/**
 * Saves session token to database
 * Called only once after CRM validation in callback
 */
export async function saveSessionToDatabase(token: string, userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    const expiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE * 1000);
    await client.query(
      `UPDATE app_users
       SET active_token = $1, token_expires_at = $2, updated_at = NOW()
       WHERE external_id = $3`,
      [token, expiresAt, userId]
    );
  } finally {
    client.release();
  }
}

/**
 * Builds a PermissionMap from raw permission rows returned by a JOIN query.
 * Admin users get full access; users without role_id get view-only defaults.
 */
function buildPermissionMap(
  role: UserRole,
  permRows: Array<{ feature_key: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }>
): PermissionMap {
  // Admin bypass: full access to everything
  if (role === UserRole.ADMIN) {
    const map: PermissionMap = {};
    for (const f of FEATURES) {
      map[f.key] = { can_view: true, can_create: true, can_edit: true, can_delete: true };
    }
    return map;
  }

  // No permission rows (no role_id): default view-only
  if (permRows.length === 0) {
    const map: PermissionMap = {};
    for (const f of FEATURES) {
      map[f.key] = { can_view: true, can_create: false, can_edit: false, can_delete: false };
    }
    return map;
  }

  // Build map from DB rows
  const map: PermissionMap = {};
  for (const row of permRows) {
    map[row.feature_key as FeatureKey] = {
      can_view: row.can_view,
      can_create: row.can_create,
      can_edit: row.can_edit,
      can_delete: row.can_delete,
    };
  }
  return map;
}

/**
 * Validates token by checking database.
 * Never calls CRM - tokens are validated once in callback, then stored in DB.
 * Returns user with resolved permissions from their assigned role.
 */
export async function validateTokenFromDatabase(token: string): Promise<{ valid: boolean; user?: CRMUser }> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT u.external_id, u.email, u.name, u.role, u.role_id,
              rp.feature_key, rp.can_view, rp.can_create, rp.can_edit, rp.can_delete
       FROM app_users u
       LEFT JOIN app_role_permissions rp ON rp.role_id = u.role_id
       WHERE u.active_token = $1
         AND u.token_expires_at > NOW()
         AND u.deleted_at IS NULL`,
      [token]
    );

    if (result.rows.length === 0) {
      return { valid: false };
    }

    const first = result.rows[0];
    const permRows = result.rows.filter((r: Record<string, unknown>) => r.feature_key != null);
    const permissions = buildPermissionMap(first.role, permRows);

    return {
      valid: true,
      user: {
        id: first.external_id,
        email: first.email,
        name: first.name,
        role: first.role,
        permissions,
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Validates token with CRM (ONE-TIME USE - only call from callback!)
 * CRM invalidates tokens after first validation
 */
export async function validateTokenWithCRM(token: string): Promise<AuthValidationResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${CRM_BASE_URL}${CRM_VALIDATE_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Auth] CRM validation failed:', response.status, errorText);
      return { success: false, error: `CRM validation failed: ${response.status}` };
    }

    const userData = await response.json();

    if (!userData || !userData.id) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get user + permissions from database
    const client = await pool.connect();
    try {
      const dbResult = await client.query(
        `SELECT u.external_id, u.email, u.name, u.role, u.role_id,
                rp.feature_key, rp.can_view, rp.can_create, rp.can_edit, rp.can_delete
         FROM app_users u
         LEFT JOIN app_role_permissions rp ON rp.role_id = u.role_id
         WHERE u.external_id = $1 AND u.deleted_at IS NULL`,
        [userData.id]
      );

      if (dbResult.rows.length === 0) {
        return { success: false, error: 'User not found or deleted' };
      }

      const first = dbResult.rows[0];
      const permRows = dbResult.rows.filter((r: Record<string, unknown>) => r.feature_key != null);
      const permissions = buildPermissionMap(first.role, permRows);

      return {
        success: true,
        user: {
          id: first.external_id,
          email: first.email,
          name: first.name,
          role: first.role,
          permissions,
        },
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Auth] CRM validation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extracts authentication token from request cookies
 */
export function getAuthToken(request: NextRequest): string | null {
  return request.cookies.get(AUTH_COOKIE_NAME)?.value || null;
}

/**
 * Sets authentication cookie on response
 */
export function setAuthCookie(token: string, response: NextResponse): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: '/',
  });
}

/**
 * Clears authentication cookie from response
 */
export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Clears user session from database
 */
export async function clearSessionFromDatabase(token: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE app_users SET active_token = NULL, token_expires_at = NULL WHERE active_token = $1',
      [token]
    );
  } finally {
    client.release();
  }
}

/**
 * Validates auth token from request
 * Uses database to check validity - never calls CRM
 */
export async function validateRequest(request: NextRequest): Promise<{ valid: boolean; user?: CRMUser }> {
  const token = getAuthToken(request);

  if (!token) {
    return { valid: false };
  }

  // Validate against database only - CRM is called once in callback
  return validateTokenFromDatabase(token);
}

/**
 * Revokes all sessions for a specific user
 */
export async function revokeUserSessions(userId: string): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'UPDATE app_users SET active_token = NULL, token_expires_at = NULL WHERE external_id = $1',
      [userId]
    );
    return result.rowCount || 0;
  } finally {
    client.release();
  }
}

/**
 * Clears all expired sessions from database (cleanup job)
 */
export async function clearExpiredSessions(): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'UPDATE app_users SET active_token = NULL, token_expires_at = NULL WHERE token_expires_at < NOW()'
    );
    return result.rowCount || 0;
  } finally {
    client.release();
  }
}
