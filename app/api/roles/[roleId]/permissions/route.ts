/**
 * API route for Role Permissions
 * PUT /api/roles/[roleId]/permissions — Replace all permissions for a role (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/rbac';
import { updatePermissions } from '@/lib/roles/db';
import type { UpdatePermissionsRequest } from '@/types/roles';

type RouteParams = { params: Promise<{ roleId: string }> };

/**
 * PUT /api/roles/[roleId]/permissions
 * Replaces all permissions for a role. Blocks system roles.
 * Body: { permissions: [{ featureKey, canView, canCreate, canEdit, canDelete }] }
 */
export const PUT = withAdmin(async (
  request: NextRequest,
  _user,
  ...[{ params }]: [RouteParams]
) => {
  const { roleId } = await params;

  try {
    const body: UpdatePermissionsRequest = await request.json();

    if (!body.permissions || !Array.isArray(body.permissions)) {
      return NextResponse.json(
        { success: false, error: 'permissions array is required' },
        { status: 400 }
      );
    }

    const permissions = await updatePermissions(roleId, body.permissions);
    return NextResponse.json({ success: true, data: permissions });
  } catch (error) {
    console.error('[API /roles/[roleId]/permissions PUT] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update permissions';
    const status = message.includes('not found') ? 404
      : message.includes('System') ? 403
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
});
