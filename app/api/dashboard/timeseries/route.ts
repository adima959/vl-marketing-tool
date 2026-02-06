import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { dashboardQueryBuilder } from '@/lib/server/dashboardQueryBuilder';
import type { TimeSeriesDataPoint, TimeSeriesResponse } from '@/types/dashboard';
import { withAdmin } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { maskErrorForClient } from '@/lib/types/errors';
import { z } from 'zod';

/**
 * Request schema for time series endpoint
 */
const timeSeriesRequestSchema = z.object({
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }),
});

/**
 * Raw database row type
 */
interface RawTimeSeriesRow {
  date: string | Date;
  customers: number | string;
  subscriptions: number | string;
  trials: number | string;
  trialsApproved: number | string;
  upsells: number | string;
}

/**
 * POST /api/dashboard/timeseries
 * Time series data for dashboard chart (daily aggregation)
 * Requires admin authentication
 */
async function handleTimeSeriesQuery(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse<TimeSeriesResponse>> {
  try {
    // Parse and validate request body
    const rawBody = await request.json();
    const body = timeSeriesRequestSchema.parse(rawBody);

    // Convert ISO date strings to Date objects
    const dateRange = {
      start: new Date(body.dateRange.start),
      end: new Date(body.dateRange.end),
    };

    // Build SQL query for time series
    const { query, params } = dashboardQueryBuilder.buildTimeSeriesQuery(dateRange);

    // Execute query against MariaDB
    const rows = await executeMariaDBQuery<RawTimeSeriesRow>(query, params);

    // Transform to frontend format
    const data: TimeSeriesDataPoint[] = rows.map((row) => {
      // Format date as YYYY-MM-DD string
      const dateValue = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : String(row.date).split('T')[0];

      return {
        date: dateValue,
        customers: Number(row.customers) || 0,
        subscriptions: Number(row.subscriptions) || 0,
        trials: Number(row.trials) || 0,
        trialsApproved: Number(row.trialsApproved) || 0,
        upsells: Number(row.upsells) || 0,
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          data: [],
          error: `Validation error: ${error.message}`,
        },
        { status: 400 }
      );
    }

    const { message, statusCode } = maskErrorForClient(error, 'Dashboard Timeseries API');

    return NextResponse.json(
      {
        success: false,
        data: [],
        error: message,
      },
      { status: statusCode }
    );
  }
}

// Export with admin authentication
export const POST = withAdmin(handleTimeSeriesQuery);

/**
 * GET /api/dashboard/timeseries
 * Health check endpoint
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/dashboard/timeseries',
    methods: ['POST'],
    description: 'Dashboard time series data for chart visualization',
    timestamp: new Date().toISOString(),
  });
}
