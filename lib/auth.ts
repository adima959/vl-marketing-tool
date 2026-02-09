import type { AuthValidationResponse, CRMUser } from '@/types/auth';
import type { AppUser } from '@/types/user';
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
 * Validates token by checking database
 * Never calls CRM - tokens are validated once in callback, then stored in DB
 */
async function validateTokenFromDatabase(token: string): Promise<{ valid: boolean; user?: CRMUser }> {
  const client = await pool.connect();
  try {
    const result = await client.query<AppUser>(
      `SELECT * FROM app_users
       WHERE active_token = $1
         AND token_expires_at > NOW()
         AND deleted_at IS NULL`,
      [token]
    );

    if (result.rows.length === 0) {
      return { valid: false };
    }

    const user = result.rows[0];

    return {
      valid: true,
      user: {
        id: user.external_id,
        email: user.email,
        name: user.name,
        role: user.role,
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

    // Get user from database to get current role
    const client = await pool.connect();
    try {
      const dbResult = await client.query<AppUser>(
        'SELECT * FROM app_users WHERE external_id = $1 AND deleted_at IS NULL',
        [userData.id]
      );

      if (dbResult.rows.length === 0) {
        return { success: false, error: 'User not found or deleted' };
      }

      const dbUser = dbResult.rows[0];

      return {
        success: true,
        user: {
          id: dbUser.external_id,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
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
    sameSite: 'lax',
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
    sameSite: 'lax',
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
