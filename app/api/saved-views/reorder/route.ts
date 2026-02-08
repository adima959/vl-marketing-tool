import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withAuth } from '@/lib/rbac';
import { safeValidateRequest, savedViewReorderSchema } from '@/lib/schemas/api';
import { maskErrorForClient } from '@/lib/types/errors';
import type { AppUser } from '@/types/user';

/**
 * PATCH /api/saved-views/reorder
 * Bulk update favorite_order for the current user's favorited views
 */
async function handlePatch(
  request: NextRequest,
  user: AppUser
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const result = safeValidateRequest(savedViewReorderSchema, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.issues[0]?.message || 'Invalid request' },
        { status: 400 }
      );
    }

    const { items } = result.data;

    // Build parameterized VALUES list for bulk update
    const values: unknown[] = [];
    const valueClauses: string[] = [];
    let paramIdx = 1;

    for (const item of items) {
      valueClauses.push(`($${paramIdx}::uuid, $${paramIdx + 1}::int)`);
      values.push(item.id, item.favoriteOrder);
      paramIdx += 2;
    }

    const userParamIdx = paramIdx;
    values.push(user.id);

    await executeQuery(
      `UPDATE app_saved_views AS sv
       SET favorite_order = v.new_order, updated_at = NOW()
       FROM (VALUES ${valueClauses.join(', ')}) AS v(id, new_order)
       WHERE sv.id = v.id AND sv.user_id = $${userParamIdx}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const masked = maskErrorForClient(error, 'saved-views:reorder');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

export const PATCH = withAuth(handlePatch);
