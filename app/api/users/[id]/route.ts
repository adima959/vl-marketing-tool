import { NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { withPermission } from '@/lib/rbac';
import { UserRole, type UpdateUserRoleDTO } from '@/types/user';
import { revokeUserSessions } from '@/lib/auth';
import { unstable_rethrow } from 'next/navigation';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * PATCH /api/users/[id]
 * Updates user role/permissions (admin cookie authentication only)
 * For CRM API-key access, use /api/users/[id]/external
 */
export const PATCH = withPermission('admin.user_management', 'can_edit', async (request, _user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    // Fetch current user to compare role before update
    const currentResult = await client.query(
      'SELECT role_id, role FROM app_users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (currentResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const currentUser = currentResult.rows[0] as { role_id: string | null; role: string };

    // Build dynamic SET clause from allowed fields
    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [];
    let paramIdx = 1;

    // Handle is_product_owner
    if (typeof body.is_product_owner === 'boolean') {
      setClauses.push('is_product_owner = $' + paramIdx);
      values.push(body.is_product_owner);
      paramIdx++;
    }

    // Handle role_id (with legacy role enum derivation)
    if (body.role_id && typeof body.role_id === 'string') {
      const roleResult = await client.query(
        'SELECT name FROM app_roles WHERE id = $1 AND deleted_at IS NULL',
        [body.role_id]
      );

      if (roleResult.rows.length === 0) {
        return NextResponse.json({ error: 'Role not found' }, { status: 404 });
      }

      const roleName = roleResult.rows[0].name as string;
      const legacyRole = roleName.toLowerCase() === 'admin' ? 'admin' : 'user';

      setClauses.push('role_id = $' + paramIdx);
      values.push(body.role_id);
      paramIdx++;
      setClauses.push('role = $' + paramIdx);
      values.push(legacyRole);
      paramIdx++;
    }

    // If no recognized fields, try legacy { role } path
    if (values.length === 0) {
      const legacyBody = body as unknown as UpdateUserRoleDTO;
      if (!legacyBody.role || !Object.values(UserRole).includes(legacyBody.role)) {
        return NextResponse.json(
          { error: 'Invalid request. Provide role_id, is_product_owner, or role.' },
          { status: 400 }
        );
      }
      setClauses.push('role = $' + paramIdx);
      values.push(legacyBody.role);
      paramIdx++;
    }

    values.push(id);
    const query = 'UPDATE app_users SET ' + setClauses.join(', ')
      + ' WHERE id = $' + paramIdx + ' AND deleted_at IS NULL'
      + ' RETURNING id, external_id, name, email, role, role_id, is_product_owner, updated_at';
    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updatedUser = result.rows[0];

    // Only revoke sessions when role actually CHANGED (not just present in request)
    // The EditRoleDialog always sends role_id + is_product_owner together,
    // so we must compare against the previous value to avoid revoking on no-op
    const roleActuallyChanged =
      (body.role_id && typeof body.role_id === 'string' && body.role_id !== currentUser.role_id) ||
      (body.role && body.role !== currentUser.role);
    if (roleActuallyChanged) {
      await revokeUserSessions(updatedUser.external_id);
    }

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    unstable_rethrow(error);
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
 * Soft deletes a user (admin cookie authentication only)
 * For CRM API-key access, use /api/users/[id]/external
 */
export const DELETE = withPermission('admin.user_management', 'can_delete', async (_request, _user, { params }: { params: Promise<{ id: string }> }) => {
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
    console.error('[API /users/[id] DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
