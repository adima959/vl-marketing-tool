import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withAuth } from '@/lib/rbac';
import { safeValidateRequest, savedViewToggleFavoriteSchema } from '@/lib/schemas/api';
import { maskErrorForClient } from '@/lib/types/errors';
import type { AppUser } from '@/types/user';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/saved-views/[id]/favorite
 * Toggle favorite status of a saved view (ownership verified)
 */
async function handlePatch(
  request: NextRequest,
  user: AppUser,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = safeValidateRequest(savedViewToggleFavoriteSchema, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.issues[0]?.message || 'Invalid request' },
        { status: 400 }
      );
    }

    const { isFavorite } = result.data;

    if (isFavorite) {
      // Favoriting: set is_favorite = true and assign next order
      const rows = await executeQuery<{ id: string }>(
        `UPDATE app_saved_views
         SET is_favorite = true,
             favorite_order = (
               SELECT COALESCE(MAX(favorite_order), -1) + 1
               FROM app_saved_views
               WHERE user_id = $1 AND is_favorite = true
             ),
             updated_at = NOW()
         WHERE id = $2 AND user_id = $1
         RETURNING id`,
        [user.id, id]
      );

      if (rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Saved view not found' },
          { status: 404 }
        );
      }
    } else {
      // Unfavoriting: clear favorite status and order
      const rows = await executeQuery<{ id: string }>(
        `UPDATE app_saved_views
         SET is_favorite = false, favorite_order = NULL, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, user.id]
      );

      if (rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Saved view not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const masked = maskErrorForClient(error, 'saved-views:favorite');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

export const PATCH = withAuth(handlePatch);
