/**
 * GET /api/marketing-pipeline/users
 * Returns a list of users for dropdown filters.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUsers } from '@/lib/marketing-pipeline/db';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

export const GET = withPermission('tools.marketing_pipeline', 'can_view', async (
  request: NextRequest,
  user: AppUser,
): Promise<NextResponse> => {
  try {
    const users = await getUsers();
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 },
    );
  }
});
