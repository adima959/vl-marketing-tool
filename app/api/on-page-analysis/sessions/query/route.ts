import { NextRequest, NextResponse } from 'next/server';
import { getTrackerDataFlat } from '@/lib/server/trackerQueryBuilder';
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

    const data = await getTrackerDataFlat({
      dateRange: {
        start: new Date(body.dateRange.start),
        end: new Date(body.dateRange.end),
      },
      dimensions: body.dimensions,
      filters: body.filters,
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
