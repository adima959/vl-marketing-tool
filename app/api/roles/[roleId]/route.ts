/**
 * API routes for single Role operations
 * GET    /api/roles/[roleId] — Get role with permissions (admin only)
 * PATCH  /api/roles/[roleId] — Update role name/description (admin only)
 * DELETE /api/roles/[roleId] — Soft delete role (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac';
import { getRoleWithPermissions, updateRole, deleteRole } from '@/lib/roles/db';
import type { UpdateRoleRequest } from '@/types/roles';
import { unstable_rethrow } from 'next/navigation';

type RouteParams = { params: Promise<{ roleId: string }> };

/**
 * GET /api/roles/[roleId]
 * Returns role with all its permissions
 */
export const GET = withPermission('admin.role_permissions', 'can_view', async (
  _request: NextRequest,
  _user,
  ...[{ params }]: [RouteParams]
) => {
  const { roleId } = await params;

  try {
    const role = await getRoleWithPermissions(roleId);
    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: role });
  } catch (error) {
    unstable_rethrow(error);
    console.error('[API /roles/[roleId] GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch role' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/roles/[roleId]
 * Updates role name and/or description. Blocks system roles.
 */
export const PATCH = withPermission('admin.role_permissions', 'can_edit', async (
  request: NextRequest,
  _user,
  ...[{ params }]: [RouteParams]
) => {
  const { roleId } = await params;

  try {
    const body: UpdateRoleRequest = await request.json();

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Role name cannot be empty' },
        { status: 400 }
      );
    }

    const role = await updateRole(roleId, {
      name: body.name?.trim(),
      description: body.description?.trim(),
    });

    return NextResponse.json({ success: true, data: role });
  } catch (error) {
    unstable_rethrow(error);
    console.error('[API /roles/[roleId] PATCH] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update role';
    const status = message.includes('not found') ? 404
      : message.includes('System') ? 403
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
});

/**
 * DELETE /api/roles/[roleId]
 * Soft deletes a role. Blocks system roles and roles with assigned users.
 */
export const DELETE = withPermission('admin.role_permissions', 'can_delete', async (
  _request: NextRequest,
  _user,
  ...[{ params }]: [RouteParams]
) => {
  const { roleId } = await params;

  try {
    await deleteRole(roleId);
    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    console.error('[API /roles/[roleId] DELETE] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete role';
    const status = message.includes('not found') ? 404
      : message.includes('System') || message.includes('Cannot delete') ? 403
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
});
