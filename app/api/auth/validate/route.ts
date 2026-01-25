import { validateRequest } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Auth validation proxy route
 * Client calls this to check if they're authenticated
 * Acts as a proxy to the CRM validation endpoint
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log('[Validate API] Auth validate endpoint called');

  const { valid, user } = await validateRequest(request);

  if (!valid) {
    console.log('[Validate API] Request NOT valid, returning 401');
    return NextResponse.json(
      { authenticated: false, error: 'Not authenticated' },
      { status: 401 }
    );
  }

  console.log('[Validate API] Request valid, user:', user?.email);
  return NextResponse.json({
    authenticated: true,
    user,
  });
}
