import { validateRequest } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Auth validation proxy route
 * Client calls this to check if they're authenticated
 * Acts as a proxy to the CRM validation endpoint
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { valid, user } = await validateRequest(request);

  if (!valid) {
    return NextResponse.json(
      { authenticated: false, error: 'Not authenticated' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    user,
  });
}
