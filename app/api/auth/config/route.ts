import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns auth configuration with the correct callback URL
 * This endpoint allows runtime configuration instead of build-time
 */
export async function GET(request: NextRequest) {
  console.log('[Auth Config] Request received');

  // Get the callback URL from server-side environment variable
  let callbackUrl = process.env.APP_CALLBACK_URL;
  console.log('[Auth Config] APP_CALLBACK_URL from env:', callbackUrl || '(not set)');

  if (!callbackUrl) {
    // Construct from request headers (works with reverse proxies)
    const xForwardedProto = request.headers.get('x-forwarded-proto');
    const xForwardedSsl = request.headers.get('x-forwarded-ssl');
    const proto = xForwardedProto || (xForwardedSsl === 'on' ? 'https' : 'http');

    const host = request.headers.get('x-forwarded-host') ||
                 request.headers.get('host') ||
                 'localhost:3991';

    console.log('[Auth Config] Detected from headers:', { proto, host, xForwardedProto, xForwardedSsl });
    callbackUrl = `${proto}://${host}/api/auth/callback`;
  } else if (!callbackUrl.includes('/api/auth/callback')) {
    // If APP_CALLBACK_URL is just the domain, append the path
    callbackUrl = `${callbackUrl}/api/auth/callback`;
  }

  const loginUrl = process.env.NEXT_PUBLIC_CRM_LOGIN_URL || 'https://vitaliv.no/admin/site/marketing';

  console.log('[Auth Config] Returning:', { callbackUrl, loginUrl });

  return NextResponse.json({
    callbackUrl,
    loginUrl,
  });
}
