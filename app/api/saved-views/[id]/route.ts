import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withAuth } from '@/lib/rbac';
import { safeValidateRequest, savedViewRenameSchema } from '@/lib/schemas/api';
import { maskErrorForClient } from '@/lib/types/errors';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/saved-views/[id]
 * Rename a saved view (ownership verified)
 */
async function handlePatch(
  request: NextRequest,
  user: AppUser,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = safeValidateRequest(savedViewRenameSchema, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.issues[0]?.message || 'Invalid request' },
        { status: 400 }
      );
    }

    const rows = await executeQuery<{
      id: string;
      name: string;
      page_path: string;
      date_mode: string;
      date_preset: string | null;
      date_start: string | null;
      date_end: string | null;
      dimensions: string[] | null;
      sort_by: string | null;
      sort_dir: string | null;
      period: string | null;
      created_at: string;
    }>(
      `UPDATE app_saved_views
       SET name = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, name, page_path, date_mode, date_preset, date_start, date_end, dimensions, sort_by, sort_dir, period, created_at`,
      [result.data.name, id, user.id]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Saved view not found' },
        { status: 404 }
      );
    }

    const row = rows[0];
    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        pagePath: row.page_path,
        dateMode: row.date_mode,
        datePreset: row.date_preset,
        dateStart: row.date_start,
        dateEnd: row.date_end,
        dimensions: row.dimensions,
        sortBy: row.sort_by,
        sortDir: row.sort_dir,
        period: row.period,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { success: false, error: 'A view with this name already exists on this page' },
        { status: 409 }
      );
    }

    const masked = maskErrorForClient(error, 'saved-views:PATCH');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

/**
 * DELETE /api/saved-views/[id]
 * Delete a saved view (ownership verified)
 */
async function handleDelete(
  request: NextRequest,
  user: AppUser,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params;

    const rows = await executeQuery<{ id: string }>(
      `DELETE FROM app_saved_views WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user.id]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Saved view not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    const masked = maskErrorForClient(error, 'saved-views:DELETE');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

/**
 * GET /api/saved-views/[id]
 * Fetch a single saved view by ID (ownership verified)
 */
async function handleGet(
  request: NextRequest,
  user: AppUser,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params;

    const rows = await executeQuery<{
      id: string;
      name: string;
      page_path: string;
      date_mode: string;
      date_preset: string | null;
      date_start: string | null;
      date_end: string | null;
      dimensions: string[] | null;
      filters: { field: string; operator: string; value: string }[] | null;
      sort_by: string | null;
      sort_dir: string | null;
      period: string | null;
      visible_columns: string[] | null;
      is_favorite: boolean;
      favorite_order: number | null;
      created_at: string;
    }>(
      `SELECT id, name, page_path, date_mode, date_preset, date_start, date_end,
              dimensions, filters, sort_by, sort_dir, period, visible_columns,
              is_favorite, favorite_order, created_at
       FROM app_saved_views
       WHERE id = $1 AND user_id = $2`,
      [id, user.id]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Saved view not found' },
        { status: 404 }
      );
    }

    const row = rows[0];
    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        pagePath: row.page_path,
        dateMode: row.date_mode,
        datePreset: row.date_preset,
        dateStart: row.date_start,
        dateEnd: row.date_end,
        dimensions: row.dimensions,
        filters: row.filters,
        sortBy: row.sort_by,
        sortDir: row.sort_dir,
        period: row.period,
        visibleColumns: row.visible_columns,
        isFavorite: row.is_favorite,
        favoriteOrder: row.favorite_order,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    const masked = maskErrorForClient(error, 'saved-views:GET');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

export const GET = withAuth(handleGet);
export const PATCH = withAuth(handlePatch);
export const DELETE = withAuth(handleDelete);
