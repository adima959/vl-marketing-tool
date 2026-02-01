import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { onPageQueryBuilder } from '@/lib/server/onPageQueryBuilder';
import type { QueryRequest } from '@/lib/types/api';
import { parseQueryRequest } from '@/lib/types/api';
import { createValidationError, maskErrorForClient } from '@/lib/types/errors';
import { withAdmin } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

interface OnPageAggregatedRow {
  dimension_id?: string;
  dimension_value: string;
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

/**
 * POST /api/on-page-analysis/query
 * API endpoint for querying on-page analytics data
 * Requires admin authentication
 */
async function handleOnPageQuery(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    const body: QueryRequest = await request.json();

    // Validate required fields
    if (!body.dateRange?.start || !body.dateRange?.end) {
      const error = createValidationError('dateRange is required');
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    if (!Array.isArray(body.dimensions) || body.dimensions.length === 0) {
      const error = createValidationError('dimensions array is required');
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    if (typeof body.depth !== 'number' || body.depth < 0) {
      const error = createValidationError('depth must be a non-negative number');
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    // Parse and build SQL query
    const queryParams = parseQueryRequest(body);
    const { query, params } = onPageQueryBuilder.buildQuery(queryParams);

    // Execute query
    const rows = await executeQuery<OnPageAggregatedRow>(query, params);

    // Check if there are more dimensions (children available)
    const hasMoreDimensions = body.depth < body.dimensions.length - 1;

    // Build key prefix from parent filters (maintains dimension order)
    const parentKeyParts = body.parentFilters
      ? body.dimensions
          .map((dim) => body.parentFilters?.[dim])
          .filter((val): val is string => val !== undefined)
          .join('::')
      : '';
    const keyPrefix = parentKeyParts ? `${parentKeyParts}::` : '';

    // Transform database rows to frontend format
    const data = rows.map((row) => {
      const keyValue = row.dimension_id != null
        ? String(row.dimension_id)
        : (row.dimension_value != null ? String(row.dimension_value) : '(not set)');

      const displayValue = row.dimension_value != null
        ? String(row.dimension_value)
        : '(not set)';

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
    const { message, statusCode } = maskErrorForClient(error, 'On-Page Analysis API');

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: statusCode }
    );
  }
}

// Export with admin authentication
export const POST = withAdmin(handleOnPageQuery);
