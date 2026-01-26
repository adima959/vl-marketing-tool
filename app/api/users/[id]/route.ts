import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { withAdmin } from '@/lib/rbac';
import { UserRole, type UpdateUserRoleDTO } from '@/types/user';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const USER_MANAGEMENT_API_KEY = process.env.USER_MANAGEMENT_API_KEY || '';

/**
 * Checks if request has valid API key
 */
function hasValidApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key');

  if (!apiKey || !USER_MANAGEMENT_API_KEY) {
    return false;
  }

  return apiKey === USER_MANAGEMENT_API_KEY;
}

/**
 * PATCH /api/users/[id]
 * Updates user role
 * Supports both API key authentication (for CRM) and admin cookie authentication (for web app)
 *
 * API Key usage from CRM:
 * curl -X PATCH https://marketing.vitaliv.no/api/users/USER_ID \
 *   -H "X-API-Key: your-secret-key" \
 *   -H "Content-Type: application/json" \
 *   -d '{"role":"admin"}'
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  // Check for API key authentication first
  if (hasValidApiKey(request)) {
    console.log('[API /users/[id] PATCH] Using API key authentication');

    // Parse request body
    let body: UpdateUserRoleDTO;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Validate role
    if (!body.role || !Object.values(UserRole).includes(body.role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "user" or "admin"' },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      // Update user role
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

      return NextResponse.json({
        success: true,
        user: result.rows[0],
      });
    } catch (error) {
      console.error('[API /users/[id] PATCH] Error:', error);
      return NextResponse.json(
        { error: 'Failed to update user role' },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }

  // No API key - fall back to cookie-based admin authentication
  console.log('[API /users/[id] PATCH] Using cookie authentication (admin required)');
  return withAdminPatch(request, { params: { id } });
}

// Cookie-based admin handler for PATCH
const withAdminPatch = withAdmin(async (request, _user, { params }: { params: { id: string } }) => {
  const { id } = params;

  // Parse request body
  let body: UpdateUserRoleDTO;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate role
  if (!body.role || !Object.values(UserRole).includes(body.role)) {
    return NextResponse.json(
      { error: 'Invalid role. Must be "user" or "admin"' },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    // Update user role
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

    return NextResponse.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error('[API /users/[id] PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update user role' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/users/[id]
 * Soft deletes a user by setting deleted_at timestamp
 * Supports both API key authentication (for CRM) and admin cookie authentication (for web app)
 * User sessions will be automatically invalidated on next request
 *
 * API Key usage from CRM:
 * curl -X DELETE https://marketing.vitaliv.no/api/users/USER_ID \
 *   -H "X-API-Key: your-secret-key"
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  // Check for API key authentication first
  if (hasValidApiKey(request)) {
    console.log('[API /users/[id] DELETE] Using API key authentication');

    const client = await pool.connect();

    try {
      // Soft delete user by setting deleted_at
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
      console.error('[API /users/[id] DELETE] Error:', error);
      return NextResponse.json(
        { error: 'Failed to delete user' },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }

  // No API key - fall back to cookie-based admin authentication
  console.log('[API /users/[id] DELETE] Using cookie authentication (admin required)');
  return withAdminDelete(request, { params: { id } });
}

// Cookie-based admin handler for DELETE
const withAdminDelete = withAdmin(async (_request, _user, { params }: { params: { id: string } }) => {
  const { id } = params;

  const client = await pool.connect();

  try {
    // Soft delete user by setting deleted_at
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
    console.error('[API /users/[id] DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
