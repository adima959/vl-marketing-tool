import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { sessionQueryBuilder } from '@/lib/server/sessionQueryBuilder';
import { createValidationError, maskErrorForClient } from '@/lib/types/errors';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

interface FlatQueryRequest {
  dateRange: {
    start: string;
    end: string;
  };
  dimensions: string[];
  filters?: Array<{ field: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>;
}

/**
 * POST /api/on-page-analysis/sessions/query
 *
 * Returns flat rows grouped by ALL requested dimensions in a single query.
 * Each row contains dimension values + base metric counts.
 * The client builds the hierarchical tree and computes derived metrics.
 */
async function handleSessionQuery(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    const body: FlatQueryRequest = await request.json();

    if (!body.dateRange?.start || !body.dateRange?.end) {
      const error = createValidationError('dateRange is required');
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    if (!Array.isArray(body.dimensions) || body.dimensions.length === 0) {
      const error = createValidationError('dimensions array is required');
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }

    const { query, params } = sessionQueryBuilder.buildFlatQuery({
      dateRange: {
        start: new Date(body.dateRange.start),
        end: new Date(body.dateRange.end),
      },
      dimensions: body.dimensions,
      filters: body.filters,
    });

    const rows = await executeQuery<Record<string, unknown>>(query, params);

    // Normalize rows: Date → YYYY-MM-DD, null → 'Unknown', numbers coerced
    const data = rows.map(row => {
      const result: Record<string, string | number> = {};

      for (const dim of body.dimensions) {
        const raw = row[dim];
        if (raw instanceof Date) {
          const y = String(raw.getUTCFullYear());
          const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
          const d = String(raw.getUTCDate()).padStart(2, '0');
          result[dim] = `${y}-${m}-${d}`;
        } else {
          result[dim] = raw != null ? String(raw) : 'Unknown';
        }

        // Include companion ID for enriched dimensions
        const idKey = `_${dim}_id`;
        if (row[idKey] != null) {
          result[idKey] = String(row[idKey]);
        }
      }

      // Base metric counts (raw, not pre-computed ratios)
      result.page_views = Number(row.page_views) || 0;
      result.unique_visitors = Number(row.unique_visitors) || 0;
      result.bounced_count = Number(row.bounced_count) || 0;
      result.active_time_count = Number(row.active_time_count) || 0;
      result.total_active_time = Number(row.total_active_time) || 0;
      result.scroll_past_hero = Number(row.scroll_past_hero) || 0;
      result.form_views = Number(row.form_views) || 0;
      result.form_starters = Number(row.form_starters) || 0;

      return result;
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    unstable_rethrow(error);
    const { message, statusCode } = maskErrorForClient(error, 'Session Analytics API');
    return NextResponse.json(
      { success: false, error: message },
      { status: statusCode }
    );
  }
}

export const POST = withPermission('analytics.on_page_analysis', 'can_view', handleSessionQuery);
