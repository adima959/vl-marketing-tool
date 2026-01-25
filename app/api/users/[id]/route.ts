import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { withAdmin } from '@/lib/rbac';
import { UserRole, type UpdateUserRoleDTO } from '@/types/user';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * PATCH /api/users/[id]
 * Updates user role (admin only)
 */
export const PATCH = withAdmin(async (request, user, { params }: { params: { id: string } }) => {
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
 * Soft deletes a user by setting deleted_at timestamp (admin only)
 * User sessions will be automatically invalidated on next request
 */
export const DELETE = withAdmin(async (request, user, { params }: { params: { id: string } }) => {
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
