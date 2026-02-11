import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withAuth } from '@/lib/rbac';
import { safeValidateRequest, savedViewCreateSchema } from '@/lib/schemas/api';
import { maskErrorForClient } from '@/lib/types/errors';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

/**
 * GET /api/saved-views?pagePath=/marketing-report
 * List saved views for the current user on a given page
 */
async function handleGet(request: NextRequest, user: AppUser): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const pagePath = searchParams.get('pagePath');
    const favorites = searchParams.get('favorites');

    // Favorites mode: return all favorited views across all pages
    if (favorites === 'true') {
      const rows = await executeQuery<{
        id: string;
        name: string;
        page_path: string;
        is_favorite: boolean;
        favorite_order: number | null;
        created_at: string;
      }>(
        `SELECT id, name, page_path, is_favorite, favorite_order, created_at
         FROM app_saved_views
         WHERE user_id = $1 AND is_favorite = true
         ORDER BY favorite_order ASC NULLS LAST, created_at DESC`,
        [user.id]
      );

      const views = rows.map((row) => ({
        id: row.id,
        name: row.name,
        pagePath: row.page_path,
        isFavorite: row.is_favorite,
        favoriteOrder: row.favorite_order,
        createdAt: row.created_at,
      }));

      return NextResponse.json({ success: true, data: views });
    }

    if (!pagePath) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: pagePath or favorites' },
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
      filters: { field: string; operator: string; value: string }[] | null;
      sort_by: string | null;
      sort_dir: string | null;
      period: string | null;
      visible_columns: string[] | null;
      is_favorite: boolean;
      favorite_order: number | null;
      created_at: string;
    }>(
      `SELECT id, name, page_path, date_mode, date_preset,
              date_start, date_end, dimensions, filters, sort_by, sort_dir, period,
              visible_columns, is_favorite, favorite_order, created_at
       FROM app_saved_views
       WHERE user_id = $1 AND page_path = $2
       ORDER BY created_at DESC`,
      [user.id, pagePath]
    );

    const views = rows.map((row) => ({
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
    }));

    return NextResponse.json({ success: true, data: views });
  } catch (error) {
    unstable_rethrow(error);
    const masked = maskErrorForClient(error, 'saved-views:GET');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

/**
 * POST /api/saved-views
 * Create a new saved view
 */
async function handlePost(request: NextRequest, user: AppUser): Promise<NextResponse> {
  try {
    const body = await request.json();
    const result = safeValidateRequest(savedViewCreateSchema, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.issues[0]?.message || 'Invalid request' },
        { status: 400 }
      );
    }

    const data = result.data;

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
      created_at: string;
    }>(
      `INSERT INTO app_saved_views (user_id, name, page_path, date_mode, date_preset, date_start, date_end, dimensions, filters, sort_by, sort_dir, period, visible_columns)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, name, page_path, date_mode, date_preset, date_start, date_end, dimensions, filters, sort_by, sort_dir, period, visible_columns, created_at`,
      [
        user.id,
        data.name,
        data.pagePath,
        data.dateMode,
        data.datePreset || null,
        data.dateStart || null,
        data.dateEnd || null,
        data.dimensions || null,
        data.filters ? JSON.stringify(data.filters) : null,
        data.sortBy || null,
        data.sortDir || null,
        data.period || null,
        data.visibleColumns || null,
      ]
    );

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
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { success: false, error: 'A view with this name already exists on this page' },
        { status: 409 }
      );
    }

    const masked = maskErrorForClient(error, 'saved-views:POST');
    return NextResponse.json(
      { success: false, error: masked.message },
      { status: masked.statusCode }
    );
  }
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
