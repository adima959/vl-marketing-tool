/**
 * API routes for Role management
 * GET  /api/roles — List all roles with user counts (admin only)
 * POST /api/roles — Create a new role (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/rbac';
import { getRoles, createRole } from '@/lib/roles/db';
import type { CreateRoleRequest } from '@/types/roles';
import { unstable_rethrow } from 'next/navigation';

/**
 * GET /api/roles
 * Returns all roles with user counts
 */
export const GET = withAdmin(async () => {
  try {
    const roles = await getRoles();
    return NextResponse.json({ success: true, data: roles });
  } catch (error) {
    unstable_rethrow(error);
    console.error('[API /roles GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch roles' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/roles
 * Creates a new role with optional permission cloning
 * Body: { name: string, description?: string, cloneFromRoleId?: string }
 */
export const POST = withAdmin(async (request: NextRequest) => {
  try {
    const body: CreateRoleRequest = await request.json();

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Role name is required' },
        { status: 400 }
      );
    }

    const role = await createRole({
      name: body.name.trim(),
      description: body.description?.trim(),
      cloneFromRoleId: body.cloneFromRoleId,
    });

    return NextResponse.json({ success: true, data: role });
  } catch (error) {
    unstable_rethrow(error);
    console.error('[API /roles POST] Error:', error);

    const message = error instanceof Error ? error.message : 'Failed to create role';
    // Unique constraint violation
    const status = message.includes('unique') || message.includes('duplicate') ? 409 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
});
