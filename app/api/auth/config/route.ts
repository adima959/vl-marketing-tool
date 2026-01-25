import { NextResponse } from 'next/server';

/**
 * Returns auth configuration with the callback URL from environment variable
 */
export async function GET() {
  // Simply use the environment variable - NO auto-detection
  const appCallbackUrl = process.env.APP_CALLBACK_URL;

  console.log('[Auth Config] APP_CALLBACK_URL:', appCallbackUrl || 'NOT SET');

  // If not set, return error - user MUST configure it
  if (!appCallbackUrl) {
    console.error('[Auth Config] ERROR: APP_CALLBACK_URL not configured!');
    return NextResponse.json(
      {
        error: 'APP_CALLBACK_URL not configured in environment variables',
        callbackUrl: null,
        loginUrl: process.env.NEXT_PUBLIC_CRM_LOGIN_URL || 'https://vitaliv.no/admin/site/marketing',
      },
      { status: 500 }
    );
  }

  // Add /api/auth/callback if not already included
  const callbackUrl = appCallbackUrl.includes('/api/auth/callback')
    ? appCallbackUrl
    : `${appCallbackUrl}/api/auth/callback`;

  const loginUrl = process.env.NEXT_PUBLIC_CRM_LOGIN_URL || 'https://vitaliv.no/admin/site/marketing';

  console.log('[Auth Config] Returning:', { callbackUrl, loginUrl });

  return NextResponse.json({
    callbackUrl,
    loginUrl,
  });
}
