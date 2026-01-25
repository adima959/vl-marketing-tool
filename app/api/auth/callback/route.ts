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

  // Add token to session whitelist FIRST (so validation can check it)
  console.log('[Callback] Adding token to whitelist');
  addSessionToWhitelist(token);

  // Validate token with CRM
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

  // Create redirect response to original URL
  const response = NextResponse.redirect(new URL("/", request.url));

  // Set HTTP-only auth cookie with the session token
  console.log('[Callback] Setting auth cookie');
  setAuthCookie(token, response);

  console.log('[Callback] Redirecting to home page');
  return response;
}
