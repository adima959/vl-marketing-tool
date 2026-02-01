import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { dashboardQueryBuilder } from '@/lib/server/dashboardQueryBuilder';
import type { DashboardRow } from '@/types/dashboard';
import { withAdmin } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { maskErrorForClient } from '@/lib/types/errors';
import { queryRequestSchema } from '@/lib/schemas/api';
import { z } from 'zod';

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

    // Build SQL query using MariaDB query builder
    const { query, params } = dashboardQueryBuilder.buildQuery({
      dateRange,
      dimensions: body.dimensions,
      depth: body.depth,
      parentFilters: body.parentFilters,
      sortBy: body.sortBy || 'subscriptions',
      sortDirection: body.sortDirection || 'DESC',
      limit: 1000,
    });

    // Execute query against MariaDB
    const rows = await executeMariaDBQuery<any>(query, params);

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

    // Transform database rows to frontend format
    let data: DashboardRow[];

    if (body.depth === 0) {
      // Depth 0: Country aggregation (display in uppercase)
      data = rows.map((row) => {
        const country = row.country || '(not set)';
        const countryUpper = country.toUpperCase();
        return {
          key: `${keyPrefix}${country}`,
          attribute: countryUpper,
          depth: body.depth,
          hasChildren: hasMoreDimensions,
          metrics: {
            customers: Number(row.customer_count) || 0,
            subscriptions: Number(row.subscription_count) || 0,
            trials: Number(row.trial_count) || 0,
            trialsApproved: Number(row.trials_approved_count) || 0,
            upsells: Number(row.upsell_count) || 0,
          },
        };
      });
    } else if (body.depth === 1) {
      // Depth 1: Product aggregation
      data = rows.map((row) => ({
        key: `${keyPrefix}${row.product_name || '(not set)'}`,
        attribute: row.product_name || '(not set)',
        depth: body.depth,
        hasChildren: hasMoreDimensions,
        metrics: {
          customers: Number(row.customer_count) || 0,
          subscriptions: Number(row.subscription_count) || 0,
          trials: Number(row.trial_count) || 0,
          trialsApproved: Number(row.trials_approved_count) || 0,
          upsells: Number(row.upsell_count) || 0,
        },
      }));
    } else {
      // Depth 2: Source aggregation
      data = rows.map((row) => ({
        key: `${keyPrefix}${row.source || '(not set)'}`,
        attribute: row.source || '(not set)',
        depth: body.depth,
        hasChildren: false, // Leaf nodes (no depth 3)
        metrics: {
          customers: Number(row.customer_count) || 0,
          subscriptions: Number(row.subscription_count) || 0,
          trials: Number(row.trial_count) || 0,
          trialsApproved: Number(row.trials_approved_count) || 0,
          upsells: Number(row.upsell_count) || 0,
        },
      }));
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    // Handle Zod validation errors specifically
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: `Validation error: ${error.message}`,
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
export const POST = withAdmin(handleDashboardQuery);

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
