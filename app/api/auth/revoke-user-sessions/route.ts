import { NextRequest, NextResponse } from 'next/server';
import { revokeUserSessions } from '@/lib/auth';
import { timingSafeCompare } from '@/lib/security/timing-safe-compare';

const USER_MANAGEMENT_API_KEY = process.env.USER_MANAGEMENT_API_KEY || '';

/**
 * POST /api/auth/revoke-user-sessions
 * Revokes all active sessions for a specific user by their external_id (CRM user ID)
 * API key protected - for server-to-server calls from CRM
 *
 * Usage from CRM:
 * curl -X POST https://marketing.vitaliv.no/api/auth/revoke-user-sessions \
 *   -H "X-API-Key: your-secret-key" \
 *   -H "Content-Type: application/json" \
 *   -d '{"external_id":"123"}'
 *
 * This will immediately invalidate all active sessions for that user.
 * The user will be logged out on their next request.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check for API key
  const apiKey = request.headers.get('X-API-Key');

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing X-API-Key header' },
      { status: 401 }
    );
  }

  if (!USER_MANAGEMENT_API_KEY) {
    console.error('[Revoke Sessions] USER_MANAGEMENT_API_KEY not configured');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  // Use timing-safe comparison to prevent timing attacks
  if (!timingSafeCompare(apiKey, USER_MANAGEMENT_API_KEY)) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 403 }
    );
  }

  // Parse request body
  let body: { external_id: string };
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate required fields
  if (!body.external_id) {
    return NextResponse.json(
      { error: 'Missing required field: external_id' },
      { status: 400 }
    );
  }

  // Revoke all sessions for this user
  const removedCount = await revokeUserSessions(body.external_id);

  return NextResponse.json({
    success: true,
    message: `Revoked ${removedCount} session(s) for user ${body.external_id}`,
    sessions_revoked: removedCount,
  });
}
