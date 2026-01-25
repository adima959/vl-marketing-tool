import { NextRequest, NextResponse } from 'next/server';
import { clearAllSessions, getSessionStats } from '@/lib/auth';

const SESSION_WIPE_API_KEY = process.env.SESSION_WIPE_API_KEY || '';

/**
 * Session wipe endpoint
 * Clears all active sessions, effectively logging out all users
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

  if (apiKey !== SESSION_WIPE_API_KEY) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 403 }
    );
  }

  // Get stats before clearing
  const statsBefore = getSessionStats();

  // Clear all sessions
  clearAllSessions();

  // Get stats after clearing
  const statsAfter = getSessionStats();

  return NextResponse.json({
    success: true,
    message: 'All sessions cleared successfully',
    sessionsClearedCount: statsBefore.activeSessions,
    before: statsBefore,
    after: statsAfter,
  });
}

/**
 * GET endpoint to check session statistics
 * Also requires API key for security
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Check for API key
  const apiKey = request.headers.get('X-API-Key');

  if (!apiKey || apiKey !== SESSION_WIPE_API_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const stats = getSessionStats();

  return NextResponse.json({
    success: true,
    stats,
  });
}
