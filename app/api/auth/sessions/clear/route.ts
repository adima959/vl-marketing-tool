import { NextRequest, NextResponse } from 'next/server';
import { clearExpiredSessions } from '@/lib/auth';
import { timingSafeCompare } from '@/lib/security/timing-safe-compare';

const SESSION_WIPE_API_KEY = process.env.SESSION_WIPE_API_KEY || '';

/**
 * Session cleanup endpoint
 * Clears all expired sessions from database
 *
 * Security: Requires X-API-Key header matching SESSION_WIPE_API_KEY
 *
 * Usage from another server:
 * curl -X POST https://yourapp.com/api/auth/sessions/clear \
 *   -H "X-API-Key: your-secret-key"
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

  if (!SESSION_WIPE_API_KEY) {
    console.error('SESSION_WIPE_API_KEY not configured in environment');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (!timingSafeCompare(apiKey, SESSION_WIPE_API_KEY)) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 403 }
    );
  }

  // Clear expired sessions from database
  const clearedCount = await clearExpiredSessions();

  return NextResponse.json({
    success: true,
    message: `Cleared ${clearedCount} expired session(s)`,
    sessions_cleared: clearedCount,
  });
}

/**
 * GET endpoint to clear expired sessions
 * Also requires API key for security
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Check for API key
  const apiKey = request.headers.get('X-API-Key');

  if (!apiKey || !timingSafeCompare(apiKey, SESSION_WIPE_API_KEY)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Clear expired sessions
  const clearedCount = await clearExpiredSessions();

  return NextResponse.json({
    success: true,
    message: `Cleared ${clearedCount} expired session(s)`,
    sessions_cleared: clearedCount,
  });
}
