import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns auth configuration with the correct callback URL
 * This endpoint allows runtime configuration instead of build-time
 */
export async function GET(request: NextRequest) {
  // Get the callback URL from server-side environment variable
  // or construct it from request headers
  let callbackUrl = process.env.APP_CALLBACK_URL;

  if (!callbackUrl) {
    // Construct from request headers (works with reverse proxies)
    const proto = request.headers.get('x-forwarded-proto') ||
                  request.headers.get('x-forwarded-ssl') === 'on' ? 'https' : 'http';
    const host = request.headers.get('x-forwarded-host') ||
                 request.headers.get('host') ||
                 'localhost:3991';

    callbackUrl = `${proto}://${host}/api/auth/callback`;
  } else if (!callbackUrl.includes('/api/auth/callback')) {
    // If APP_CALLBACK_URL is just the domain, append the path
    callbackUrl = `${callbackUrl}/api/auth/callback`;
  }

  return NextResponse.json({
    callbackUrl,
    loginUrl: process.env.NEXT_PUBLIC_CRM_LOGIN_URL || 'https://vitaliv.no/admin/site/marketing',
  });
}
