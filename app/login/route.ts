import { saveSessionToDatabase, setAuthCookie, validateTokenWithCRM } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Login route handler
 * CRM redirects users here with a session token.
 * Validates the token, saves the session, sets the cookie, and redirects to dashboard.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json(
      { error: 'Missing token parameter' },
      { status: 400 }
    );
  }

  // Validate token with CRM
  const validation = await validateTokenWithCRM(token);

  if (!validation.success || !validation.user) {
    return NextResponse.json(
      { error: validation.error || 'Invalid token' },
      { status: 401 }
    );
  }

  // Save session to database
  await saveSessionToDatabase(token, validation.user.id);

  // Build redirect URL using APP_CALLBACK_URL to avoid localhost behind nginx proxy
  const appCallbackUrl = process.env.APP_CALLBACK_URL;
  let redirectUrl: URL;

  if (appCallbackUrl) {
    const baseUrl = appCallbackUrl.replace('/api/auth/callback', '');
    redirectUrl = new URL('/', baseUrl);
  } else {
    redirectUrl = new URL('/', request.url);
  }

  const response = NextResponse.redirect(redirectUrl);
  setAuthCookie(token, response);

  return response;
}
