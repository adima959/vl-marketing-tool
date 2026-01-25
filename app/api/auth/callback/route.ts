import { addSessionToWhitelist, setAuthCookie, validateTokenWithCRM } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Auth callback route handler
 * Receives session token from CRM redirect, validates it, adds to whitelist, sets cookie, and redirects
 * 
 * Expected query parameters:
 * - token: The session token (PHPSESSID) from CRM
 * - returnUrl: (optional) The URL to redirect to after setting the cookie
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log('[Callback] Auth callback called');

  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token');
  const returnUrl = searchParams.get('returnUrl') || '/';

  console.log('[Callback] Token received:', token ? `${token.substring(0, 20)}...` : 'null');
  console.log('[Callback] Return URL:', returnUrl);

  // Validate required parameters
  if (!token) {
    console.error('[Callback] Missing token parameter');
    return NextResponse.json(
      { error: 'Missing token parameter' },
      { status: 400 }
    );
  }

  // Validate token with CRM first to get user info
  console.log('[Callback] Validating token with CRM');
  const validation = await validateTokenWithCRM(token);

  if (!validation.success) {
    console.error('[Callback] Token validation failed:', validation.error);
    return NextResponse.json(
      { error: validation.error || 'Invalid token' },
      { status: 401 }
    );
  }

  console.log('[Callback] Token validation successful, user:', validation.user?.email);

  // Add token to session whitelist with user ID (for revocation by user)
  console.log('[Callback] Adding token to whitelist');
  addSessionToWhitelist(token, validation.user?.id);

  // Get the base URL from APP_CALLBACK_URL environment variable
  // This is needed for nginx proxy - request.url would be localhost
  const appCallbackUrl = process.env.APP_CALLBACK_URL;

  let redirectUrl: URL;

  if (appCallbackUrl) {
    // Extract base URL from callback URL (remove /api/auth/callback)
    const baseUrl = appCallbackUrl.replace('/api/auth/callback', '');
    console.log('[Callback] Using base URL from APP_CALLBACK_URL:', baseUrl);
    redirectUrl = new URL('/', baseUrl);
  } else {
    // Fallback to request.url (will be localhost behind proxy)
    console.warn('[Callback] APP_CALLBACK_URL not set - using request.url (may be localhost behind proxy)');
    redirectUrl = new URL('/', request.url);
  }

  console.log('[Callback] Redirect URL:', redirectUrl.toString());

  // Create redirect response to home page
  const response = NextResponse.redirect(redirectUrl);

  // Set HTTP-only auth cookie with the session token
  console.log('[Callback] Setting auth cookie');
  setAuthCookie(token, response);

  console.log('[Callback] Redirecting to home page');
  return response;
}
