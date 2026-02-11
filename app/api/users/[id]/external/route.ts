import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { UserRole, type UpdateUserRoleDTO } from '@/types/user';
import { timingSafeCompare } from '@/lib/security/timing-safe-compare';
import { revokeUserSessions } from '@/lib/auth';
import { unstable_rethrow } from 'next/navigation';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const USER_MANAGEMENT_API_KEY = process.env.USER_MANAGEMENT_API_KEY || '';

/**
 * Validates API key from X-API-Key header.
 * Returns error response if invalid, null if valid.
 */
function validateApiKey(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get('X-API-Key');

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing X-API-Key header' },
      { status: 401 }
    );
  }

  if (!USER_MANAGEMENT_API_KEY) {
    console.error('USER_MANAGEMENT_API_KEY not configured in environment');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (!timingSafeCompare(apiKey, USER_MANAGEMENT_API_KEY)) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 403 }
    );
  }

  return null;
}

/**
 * PATCH /api/users/[id]/external
 * Updates user role (API key authentication only — for CRM)
 *
 * Usage from CRM:
 * curl -X PATCH https://marketing.vitaliv.no/api/users/USER_ID/external \
 *   -H "X-API-Key: your-secret-key" \
 *   -H "Content-Type: application/json" \
 *   -d '{"role":"admin"}'
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authError = validateApiKey(request);
  if (authError) return authError;

  const { id } = await params;

  let body: UpdateUserRoleDTO;
  try {
    body = await request.json();
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (!body.role || !Object.values(UserRole).includes(body.role)) {
    return NextResponse.json(
      { error: 'Invalid role. Must be "user" or "admin"' },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE app_users
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, external_id, name, email, role, updated_at`,
      [body.role, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Revoke active sessions so new role takes effect immediately
    const user = result.rows[0];
    await revokeUserSessions(user.external_id);

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('[API /users/[id]/external PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update user role' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/users/[id]/external
 * Soft deletes a user (API key authentication only — for CRM)
 *
 * Usage from CRM:
 * curl -X DELETE https://marketing.vitaliv.no/api/users/USER_ID/external \
 *   -H "X-API-Key: your-secret-key"
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authError = validateApiKey(request);
  if (authError) return authError;

  const { id } = await params;

  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE app_users
       SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, external_id, name, email, deleted_at`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found or already deleted' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
      user: result.rows[0],
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('[API /users/[id]/external DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
