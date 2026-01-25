import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from '@/lib/auth';
import type { CRMUser } from '@/types/auth';

type AuthenticatedHandler = (
  request: NextRequest,
  user: CRMUser,
  ...args: any[]
) => Promise<NextResponse>;

/**
 * Higher-order function to protect API routes
 * Validates authentication before calling the handler
 * 
 * Usage:
 * export const GET = withAuth(async (request, user) => {
 *   // user is guaranteed to be authenticated
 *   return NextResponse.json({ data: 'protected' });
 * });
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest, ...args: any[]): Promise<NextResponse> => {
    const { valid, user } = await validateRequest(request);

    if (!valid || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Authentication required' },
        { status: 401 }
      );
    }

    return handler(request, user, ...args);
  };
}
