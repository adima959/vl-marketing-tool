import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { dashboardTableQueryBuilder } from '@/lib/server/dashboardTableQueryBuilder';
import type { DashboardRow } from '@/types/dashboard';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { maskErrorForClient } from '@/lib/types/errors';
import { queryRequestSchema } from '@/lib/schemas/api';
import { toTitleCase } from '@/lib/formatters';
import { z } from 'zod';

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

    const queryOptions = {
      dateRange,
      dimensions: body.dimensions,
      depth: body.depth,
      parentFilters: body.parentFilters,
      sortBy: body.sortBy || 'subscriptions',
      sortDirection: (body.sortDirection || 'DESC') as 'ASC' | 'DESC',
      limit: MAX_DASHBOARD_QUERY_LIMIT,
    };

    // Build main subscription query and standalone OTS query
    const { query, params } = dashboardTableQueryBuilder.buildQuery(queryOptions);
    const { query: otsQuery, params: otsParams } = dashboardTableQueryBuilder.buildOtsQuery(queryOptions);

    // Execute both queries in parallel
    const [rows, otsRows] = await Promise.all([
      executeMariaDBQuery<any>(query, params),
      executeMariaDBQuery<any>(otsQuery, otsParams),
    ]);

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
    const otsMap = new Map<string, { ots: number; otsApproved: number }>();
    for (const otsRow of otsRows) {
      const rawValue = otsRow[columnName] || 'Unknown';
      const displayValue = toTitleCase(rawValue);
      const key = `${keyPrefix}${displayValue}`;
      otsMap.set(key, {
        ots: Number(otsRow.ots_count) || 0,
        otsApproved: Number(otsRow.ots_approved_count) || 0,
      });
    }

    // Transform database rows to frontend format, merging OTS data
    const data: DashboardRow[] = rows.map((row) => {
      const rawValue = row[columnName] || 'Unknown';
      const displayValue = toTitleCase(rawValue);
      const rowKey = `${keyPrefix}${displayValue}`;

      const trials = Number(row.trial_count) || 0;
      const trialsApproved = Number(row.trials_approved_count) || 0;

      // Merge OTS from standalone query
      const otsData = otsMap.get(rowKey) || { ots: 0, otsApproved: 0 };
      const approvalDenominator = trials + otsData.ots;

      return {
        key: rowKey,
        attribute: displayValue,
        depth: body.depth,
        hasChildren: hasMoreDimensions,
        metrics: {
          customers: Number(row.customer_count) || 0,
          subscriptions: Number(row.subscription_count) || 0,
          trials,
          ots: otsData.ots,
          otsApproved: otsData.otsApproved,
          trialsApproved,
          approvalRate: approvalDenominator > 0 ? (trialsApproved + otsData.otsApproved) / approvalDenominator : 0,
          otsApprovalRate: otsData.ots > 0 ? otsData.otsApproved / otsData.ots : 0,
          upsells: Number(row.upsell_count) || 0,
          upsellsApproved: Number(row.upsells_approved_count) || 0,
          upsellApprovalRate: (Number(row.upsell_count) || 0) > 0
            ? (Number(row.upsells_approved_count) || 0) / (Number(row.upsell_count) || 0)
            : 0,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
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
