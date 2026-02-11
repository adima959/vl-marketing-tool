import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { crmQueryBuilder } from '@/lib/server/crmQueryBuilder';
import type { DashboardRow } from '@/types/dashboard';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { maskErrorForClient } from '@/lib/types/errors';
import { queryRequestSchema } from '@/lib/schemas/api';
import { buildOtsMap, transformDashboardRow, buildOtsOnlyRows } from '@/lib/server/dashboardTransforms';
import { z } from 'zod';
import { logDebug } from '@/lib/server/debugLogger';
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

    // Build main subscription query and standalone OTS query using shared builder
    const { query, params } = crmQueryBuilder.buildQuery({
      dateRange,
      groupBy: { type: 'geography', dimensions: body.dimensions },
      depth: body.depth,
      parentFilters: body.parentFilters,
      sortBy: body.sortBy || 'subscriptions',
      sortDirection: (body.sortDirection || 'DESC') as 'ASC' | 'DESC',
      limit: MAX_DASHBOARD_QUERY_LIMIT,
    });
    const { query: otsQuery, params: otsParams } = crmQueryBuilder.buildOtsQuery({
      dateRange,
      groupBy: { type: 'geography', dimensions: body.dimensions },
      depth: body.depth,
      parentFilters: body.parentFilters,
    });

    // DEBUG: Log OTS query details
    logDebug('OTS QUERY', {
      dimensions: body.dimensions,
      depth: body.depth,
      parentFilters: body.parentFilters,
      query: otsQuery,
      params: otsParams,
    });

    // Execute both queries in parallel
    const [rows, otsRows] = await Promise.all([
      executeMariaDBQuery<any>(query, params),
      executeMariaDBQuery<any>(otsQuery, otsParams),
    ]);

    // DEBUG: Log raw OTS results
    logDebug('OTS RAW RESULTS', {
      rowCount: otsRows.length,
      rows: otsRows,
    });

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

    // Build OTS lookup map keyed by display value (after toTitleCase)
    const otsMap = buildOtsMap(otsRows, columnName, keyPrefix);

    logDebug('OTS KEY BUILDING', {
      currentDimension,
      columnName,
      keyPrefix: keyPrefix || '(none)',
      otsMapSize: otsMap.size,
      otsMapKeys: Array.from(otsMap.keys()),
    });

    // Transform database rows to frontend format, merging OTS data
    const matchedOtsKeys = new Set<string>();

    const data: DashboardRow[] = rows.map((row, index) => {
      const { dashboardRow, otsKey } = transformDashboardRow(
        row, otsMap, columnName, keyPrefix, body.depth, hasMoreDimensions
      );

      if (otsMap.has(otsKey)) matchedOtsKeys.add(otsKey);

      if (index < 5) {
        logDebug(`ROW ${index + 1}`, {
          key: dashboardRow.key,
          attribute: dashboardRow.attribute,
          otsDataFound: otsMap.has(otsKey),
          ots: dashboardRow.metrics.ots,
          otsApproved: dashboardRow.metrics.otsApproved,
        });
      }

      return dashboardRow;
    });

    // Add OTS-only rows (OTS data with no matching subscription row)
    const otsOnlyRows = buildOtsOnlyRows(otsMap, matchedOtsKeys, keyPrefix, body.depth, hasMoreDimensions);
    data.push(...otsOnlyRows);

    logDebug('SUBSCRIPTION ROWS & KEY MATCHING', {
      subscriptionRowCount: rows.length,
      otsOnlyRowCount: otsOnlyRows.length,
      otsOnlyRows,
    });

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

// Export with admin authentication
export const POST = withAuth(handleDashboardQuery);

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
