import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { sessionQueryBuilder } from '@/lib/server/sessionQueryBuilder';
import { parseQueryRequest } from '@/lib/types/api';
import type { QueryRequest } from '@/lib/types/api';
import { createValidationError, maskErrorForClient } from '@/lib/types/errors';
import { toTitleCase } from '@/lib/formatters';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';

interface SessionAggregatedRow {
  dimension_value: string | Date;
  page_views: number;
  unique_visitors: number;
  bounce_rate: number;
  avg_active_time: number;
  scroll_past_hero: number;
  scroll_rate: number;
  form_views: number;
  form_view_rate: number;
  form_starters: number;
  form_start_rate: number;
}

/** Validate required fields; returns error response or null if valid */
function validateSessionBody(body: QueryRequest): NextResponse | null {
  if (!body.dateRange?.start || !body.dateRange?.end) {
    const error = createValidationError('dateRange is required');
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  if (!Array.isArray(body.dimensions) || body.dimensions.length === 0) {
    const error = createValidationError('dimensions array is required');
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  if (typeof body.depth !== 'number' || body.depth < 0) {
    const error = createValidationError('depth must be a non-negative number');
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  return null;
}

/**
 * POST /api/on-page-analysis/sessions/query
 * Session-based on-page analytics query endpoint.
 * Dual-mode: entry-level (session_entries) or funnel-level (page views joined with sessions).
 */
async function handleSessionQuery(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    const body: QueryRequest = await request.json();

    const validationError = validateSessionBody(body);
    if (validationError) return validationError;

    const queryParams = parseQueryRequest(body);
    const { query, params } = sessionQueryBuilder.buildQuery(queryParams);

    const rows = await executeQuery<SessionAggregatedRow>(query, params);

    const currentDimension = body.dimensions[body.depth];
    const hasMoreDimensions = body.depth < body.dimensions.length - 1;

    // Build key prefix from parent filters (maintains dimension order)
    const parentKeyParts = body.parentFilters
      ? body.dimensions
          .map((dim) => body.parentFilters?.[dim])
          .filter((val): val is string => val !== undefined)
          .join('::')
      : '';
    const keyPrefix = parentKeyParts ? `${parentKeyParts}::` : '';

    const data = rows.map((row) => {
      // For date dimension, PG returns a Date object — format as YYYY-MM-DD
      const dimValue = currentDimension === 'date' && row.dimension_value instanceof Date
        ? `${row.dimension_value.getUTCFullYear()}-${String(row.dimension_value.getUTCMonth() + 1).padStart(2, '0')}-${String(row.dimension_value.getUTCDate()).padStart(2, '0')}`
        : row.dimension_value;

      const keyValue = dimValue != null ? String(dimValue) : 'Unknown';
      const displayValue = dimValue != null
        ? toTitleCase(String(dimValue))
        : 'Unknown';

      return {
        key: `${keyPrefix}${keyValue}`,
        attribute: displayValue,
        depth: body.depth,
        hasChildren: hasMoreDimensions,
        metrics: {
          pageViews: Number(row.page_views) || 0,
          uniqueVisitors: Number(row.unique_visitors) || 0,
          bounceRate: Number(row.bounce_rate) || 0,
          avgActiveTime: Number(row.avg_active_time) || 0,
          scrollPastHero: Number(row.scroll_past_hero) || 0,
          scrollRate: Number(row.scroll_rate) || 0,
          formViews: Number(row.form_views) || 0,
          formViewRate: Number(row.form_view_rate) || 0,
          formStarters: Number(row.form_starters) || 0,
          formStartRate: Number(row.form_start_rate) || 0,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
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
