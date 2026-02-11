import { saveSessionToDatabase, setAuthCookie, validateTokenWithCRM } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Validates returnUrl is same-origin to prevent open redirect attacks.
 * Only allows relative paths (starting with /) or same-origin absolute URLs.
 */
function isValidReturnUrl(url: string, baseUrl: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    return new URL(url, baseUrl).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Auth callback route handler
 * Receives session token from CRM redirect, validates it, saves to database, sets cookie, and redirects
 *
 * Expected query parameters:
 * - token: The session token (PHPSESSID) from CRM
 * - returnUrl: (optional) The URL to redirect to after setting the cookie
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token');
  const rawReturnUrl = searchParams.get('returnUrl') || '/';

  // Validate required parameters
  if (!token) {
    console.error('[Callback] Missing token parameter');
    return NextResponse.json(
      { error: 'Missing token parameter' },
      { status: 400 }
    );
  }

  // Validate token with CRM first to get user info
  const validation = await validateTokenWithCRM(token);

  if (!validation.success) {
    console.error('[Callback] Token validation failed:', validation.error);
    return NextResponse.json(
      { error: validation.error || 'Invalid token' },
      { status: 401 }
    );
  }

  // Ensure user exists in validation response
  if (!validation.user) {
    console.error('[Callback] User missing from validation response');
    return NextResponse.json(
      { error: 'User data missing from validation' },
      { status: 500 }
    );
  }

  // Save token to database for session persistence across server instances
  await saveSessionToDatabase(token, validation.user.id);

  // Get the base URL from APP_CALLBACK_URL environment variable
  // This is needed for nginx proxy - request.url would be localhost
  const appCallbackUrl = process.env.APP_CALLBACK_URL;
  const baseUrl = appCallbackUrl
    ? appCallbackUrl.replace('/api/auth/callback', '')
    : new URL(request.url).origin;

  if (!appCallbackUrl) {
    console.warn('[Callback] APP_CALLBACK_URL not set - using request.url (may be localhost behind proxy)');
  }

  // Validate returnUrl to prevent open redirect attacks
  const returnUrl = isValidReturnUrl(rawReturnUrl, baseUrl) ? rawReturnUrl : '/';
  if (returnUrl !== rawReturnUrl) {
    console.warn('[Callback] Rejected invalid returnUrl:', rawReturnUrl);
  }

  const redirectUrl = new URL(returnUrl, baseUrl);

  const response = NextResponse.redirect(redirectUrl);

  // Set HTTP-only auth cookie with the session token
  setAuthCookie(token, response);

  return response;
}
