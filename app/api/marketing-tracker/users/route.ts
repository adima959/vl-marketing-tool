/**
 * Users API for Marketing Tracker
 * GET /api/marketing-tracker/users
 *
 * Returns a list of users for dropdown filters in the marketing tracker.
 * This is a simplified endpoint that doesn't require admin auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

export const GET = withPermission('tools.marketing_tracker', 'can_view', async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const users = await executeQuery<{
      id: string;
      name: string;
      email: string;
    }>(`
      SELECT id, name, email
      FROM app_users
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `);

    return NextResponse.json({
      success: true,
      data: users,
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
});
