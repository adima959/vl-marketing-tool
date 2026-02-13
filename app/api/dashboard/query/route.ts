import { NextRequest, NextResponse } from 'next/server';
import { fetchCrmData } from '@/lib/server/crmQueryBuilder';
import type { DashboardRow } from '@/types/dashboard';
import { withPermission } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { maskErrorForClient } from '@/lib/types/errors';
import { queryRequestSchema } from '@/lib/schemas/api';
import { buildOtsMap, buildTrialMap, transformDashboardRow, buildOtsOnlyRows } from '@/lib/server/geographyTransforms';
import { z } from 'zod';
import { unstable_rethrow } from 'next/navigation';

/**
 * Maximum number of rows to return from dashboard queries.
 * Prevents excessive memory usage and query timeouts.
 */
const MAX_DASHBOARD_QUERY_LIMIT = 1000;

interface QueryRequest {
  dateRange: { start: string; end: string };
  dimensions: string[];
  depth: number;
  parentFilters?: Record<string, string>;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

interface DashboardQueryResponse {
  success: boolean;
  data?: DashboardRow[];
  error?: string;
}

/**
 * POST /api/dashboard/query
 * Main API endpoint for querying dashboard data from MariaDB
 * Requires admin authentication
 */
async function handleDashboardQuery(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse<DashboardQueryResponse>> {
  try {
    // Parse and validate request body with Zod
    const rawBody = await request.json();
    const body = queryRequestSchema.parse(rawBody);

    // Convert ISO date strings back to Date objects
    const dateRange = {
      start: new Date(body.dateRange.start),
      end: new Date(body.dateRange.end),
    };

    // Fetch all CRM data (subscription + OTS + trial) via unified orchestrator
    const crmOptions = {
      dateRange,
      groupBy: { type: 'geography' as const, dimensions: body.dimensions },
      depth: body.depth,
      parentFilters: body.parentFilters,
      sortBy: body.sortBy || 'subscriptions',
      sortDirection: (body.sortDirection || 'DESC') as 'ASC' | 'DESC',
      limit: MAX_DASHBOARD_QUERY_LIMIT,
    };
    const { subscriptionRows: rows, otsRows, trialRows } = await fetchCrmData(crmOptions);

    // Check if there are more dimensions (children available)
    const hasMoreDimensions = body.depth < body.dimensions.length - 1;

    // Build key prefix from parent filters (maintain dimension order)
    const parentKeyParts = body.parentFilters
      ? body.dimensions
          .map((dim) => body.parentFilters?.[dim])
          .filter((val): val is string => val !== undefined)
          .join('::')
      : '';
    const keyPrefix = parentKeyParts ? `${parentKeyParts}::` : '';

    // Map dimension IDs to database column names (must match query builder)
    const dimensionColumnMap: Record<string, string> = {
      country: 'country',
      productName: 'product_group_name',
      product: 'product_name',
      source: 'source',
    };

    // Get the current dimension at this depth
    const currentDimension = body.dimensions[body.depth];
    const columnName = dimensionColumnMap[currentDimension];

    if (!columnName) {
      throw new Error(`Invalid dimension at depth ${body.depth}: ${currentDimension}`);
    }

    // Build OTS and trial lookup maps keyed by display value (after toTitleCase)
    const otsMap = buildOtsMap(otsRows, columnName, keyPrefix);
    const trialMap = buildTrialMap(trialRows, columnName, keyPrefix);

    // Transform database rows to frontend format, merging OTS and trial data
    const matchedOtsKeys = new Set<string>();

    const data: DashboardRow[] = rows.map((row) => {
      const { dashboardRow, otsKey } = transformDashboardRow(
        row, otsMap, trialMap, columnName, keyPrefix, body.depth, hasMoreDimensions
      );

      if (otsMap.has(otsKey)) matchedOtsKeys.add(otsKey);

      return dashboardRow;
    });

    // Add OTS-only rows (OTS data with no matching subscription row)
    const otsOnlyRows = buildOtsOnlyRows(otsMap, matchedOtsKeys, keyPrefix, body.depth, hasMoreDimensions);
    data.push(...otsOnlyRows);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    unstable_rethrow(error);
    // Handle Zod validation errors specifically
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
        },
        { status: 400 }
      );
    }

    const { message, statusCode } = maskErrorForClient(error, 'Dashboard API');

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: statusCode }
    );
  }
}

// Export with permission-based authentication
export const POST = withPermission('analytics.dashboard', 'can_view', handleDashboardQuery);

/**
 * GET /api/dashboard/query
 * Health check endpoint
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/dashboard/query',
    methods: ['POST'],
    timestamp: new Date().toISOString(),
  });
}
