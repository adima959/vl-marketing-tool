import type { AuthValidationResponse, CachedValidation, CRMUser } from '@/types/auth';
import type { AppUser } from '@/types/user';
import { Pool } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Environment variables
const CRM_BASE_URL = process.env.CRM_BASE_URL || 'https://vitaliv.no/admin';
const CRM_VALIDATE_ENDPOINT = process.env.CRM_VALIDATE_ENDPOINT || '/site/marketing';
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'crm_auth_token';
const AUTH_COOKIE_MAX_AGE = parseInt(process.env.AUTH_COOKIE_MAX_AGE || '86400', 10);

// Session whitelist - only tokens in this cache are considered valid
const SESSION_WHITELIST_TTL_MS = AUTH_COOKIE_MAX_AGE * 1000;
const sessionWhitelist = new Map<string, number>();

// Validation result cache (5 minutes TTL for CRM API call caching)
const CACHE_TTL_MS = 5 * 60 * 1000;
const validationCache = new Map<string, CachedValidation>();

/**
 * Gets user from database by external_id and checks if active
 * @param externalId - The CRM user ID
 * @returns AppUser or null if not found or deleted
 */
async function getActiveUserFromDatabase(externalId: string): Promise<AppUser | null> {
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
 * Adds a session token to the whitelist
 */
export function addSessionToWhitelist(token: string): void {
  const expiresAt = Date.now() + SESSION_WHITELIST_TTL_MS;
  sessionWhitelist.set(token, expiresAt);
}

/**
 * Removes a session token from the whitelist
 */
export function removeSessionFromWhitelist(token: string): void {
  sessionWhitelist.delete(token);
  validationCache.delete(token);
}

/**
 * Clears all sessions from the whitelist
 */
export function clearAllSessions(): void {
  sessionWhitelist.clear();
  validationCache.clear();
}

/**
 * Checks if a token exists in the session whitelist and is not expired
 */
function isSessionWhitelisted(token: string): boolean {
  const expiresAt = sessionWhitelist.get(token);
  
  if (!expiresAt) {
    return false;
  }

  if (expiresAt <= Date.now()) {
    sessionWhitelist.delete(token);
    return false;
  }

  return true;
}

/**
 * Validates a token with the CRM API and database
 * CRITICAL: Checks database on every request for deleted users and role changes
 * @param token - The authentication token to validate
 * @returns Promise with validation response including database user info
 */
export async function validateTokenWithCRM(token: string): Promise<AuthValidationResponse> {
  console.log('[Auth] validateTokenWithCRM called with token:', token?.substring(0, 20) + '...');

  // Check if session is whitelisted
  const isWhitelisted = isSessionWhitelisted(token);
  console.log('[Auth] Token whitelisted:', isWhitelisted);

  // IMPORTANT: Do NOT use validation cache for database checks
  // We need to check the database on every request for deleted users and role changes

  // Validate with CRM
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const requestBody = { token: token };
    console.log('[Auth] Sending CRM validation request to:', `${CRM_BASE_URL}${CRM_VALIDATE_ENDPOINT}`);
    console.log('[Auth] Request body:', requestBody);

    // Send POST request with token in JSON body
    const response = await fetch(`${CRM_BASE_URL}${CRM_VALIDATE_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('[Auth] CRM response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Auth] CRM validation failed:', response.status, errorText);
      removeSessionFromWhitelist(token);
      return {
        success: false,
        error: `CRM validation failed: ${response.status}`,
      };
    }

    const userData = await response.json();
    console.log('[Auth] CRM userData received:', userData)
    // Check if user is authenticated in CRM
    if (!userData || !userData.id) {
      removeSessionFromWhitelist(token);
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // CRITICAL: Check database for user status and role in real-time
    const dbUser = await getActiveUserFromDatabase(userData.id);

    // If user doesn't exist in database or has been deleted
    if (!dbUser) {
      console.log(`[Auth] User ${userData.id} not found or deleted in database - destroying session`);
      removeSessionFromWhitelist(token);
      return {
        success: false,
        error: 'User not found or has been deleted',
      };
    }

    // User is valid - create response with database role
    const validationResult: AuthValidationResponse = {
      success: true,
      user: {
        id: dbUser.external_id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role, // Use role from database, not CRM
      },
    };

    // Cache the validation result (never expires - we check DB on each request)
    validationCache.set(token, {
      validation: validationResult,
      expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year (effectively never expires)
    });
    console.log('[Auth] Cached validation result for user:', validationResult.user?.email);

    // Auto-recovery: If token is valid but not in whitelist, add it
    if (!isWhitelisted && validationResult.user) {
      console.log(`[Auth] Auto-recovering session for user ${validationResult.user.email}`);
      addSessionToWhitelist(token);
    }

    return validationResult;
  } catch (error) {
    console.error('CRM validation error:', error);
    validationCache.delete(token);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/**
 * Extracts the authentication token from request cookies
 */
export function getAuthToken(request: NextRequest): string | null {
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value || null;
  console.log('[Auth] getAuthToken - Cookie name:', AUTH_COOKIE_NAME);
  console.log('[Auth] getAuthToken - Cookie value:', cookieValue ? `${cookieValue.substring(0, 20)}...` : 'null');
  console.log('[Auth] getAuthToken - All cookies:', Array.from(request.cookies.getAll()).map(c => c.name));
  return cookieValue;
}

/**
 * Sets the authentication cookie on a response
 */
export function setAuthCookie(token: string, response: NextResponse): void {
  console.log('[Auth] setAuthCookie - Setting cookie:', AUTH_COOKIE_NAME);
  console.log('[Auth] setAuthCookie - Token value:', token ? `${token.substring(0, 20)}...` : 'null');
  console.log('[Auth] setAuthCookie - Max age:', AUTH_COOKIE_MAX_AGE);
  console.log('[Auth] setAuthCookie - NODE_ENV:', process.env.NODE_ENV);

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
 * Clears the authentication cookie from a response
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
 * Server-side function to validate auth token from request
 * Checks whitelist and database (does NOT call CRM - that's only done once in callback)
 */
export async function validateRequest(request: NextRequest): Promise<{ valid: boolean; user?: CRMUser }> {
  console.log('[Auth] validateRequest called for path:', request.nextUrl.pathname);

  const token = getAuthToken(request);
  console.log('[Auth] Token from cookie:', token ? `${token.substring(0, 20)}...` : 'null');

  if (!token) {
    console.log('[Auth] No token found in cookie');
    return { valid: false };
  }

  // Check if token is in whitelist (session was validated during callback)
  const isWhitelisted = isSessionWhitelisted(token);
  console.log('[Auth] Token in whitelist:', isWhitelisted);

  if (!isWhitelisted) {
    console.log('[Auth] Token not in whitelist - session expired or invalid');
    return { valid: false };
  }

  // Get user info from whitelist cache
  const cachedValidation = validationCache.get(token);

  if (!cachedValidation || !cachedValidation.validation.user) {
    console.log('[Auth] No cached user data found');
    return { valid: false };
  }

  const cachedUser = cachedValidation.validation.user;
  console.log('[Auth] Found cached user:', cachedUser.email);

  // CRITICAL: Check database for current user status and role
  const dbUser = await getActiveUserFromDatabase(cachedUser.id);

  if (!dbUser) {
    console.log(`[Auth] User ${cachedUser.id} not found or deleted in database - invalidating session`);
    removeSessionFromWhitelist(token);
    return { valid: false };
  }

  console.log('[Auth] User validated successfully from whitelist + database');

  // Return user with current role from database
  return {
    valid: true,
    user: {
      id: dbUser.external_id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role, // Always use current role from database
    },
  };
}

/**
 * Clears expired entries from caches
 */
export function clearExpiredCache(): void {
  const now = Date.now();
  
  for (const [token, cached] of validationCache.entries()) {
    if (cached.expiresAt <= now) {
      validationCache.delete(token);
    }
  }

  for (const [token, expiresAt] of sessionWhitelist.entries()) {
    if (expiresAt <= now) {
      sessionWhitelist.delete(token);
    }
  }
}

/**
 * Gets session statistics
 */
export function getSessionStats() {
  return {
    activeSessions: sessionWhitelist.size,
    cachedValidations: validationCache.size,
  };
}

// Run cache cleanup every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(clearExpiredCache, 10 * 60 * 1000);
}
