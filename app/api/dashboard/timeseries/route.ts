import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { crmQueryBuilder } from '@/lib/server/crmQueryBuilder';
import { formatMariaDBDateResult } from '@/lib/server/crmMetrics';
import type { TimeSeriesDataPoint, TimeSeriesResponse } from '@/types/dashboard';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { maskErrorForClient } from '@/lib/types/errors';
import { z } from 'zod';
import { unstable_rethrow } from 'next/navigation';

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
 * Raw database row type (main subscription query — OTS is queried separately)
 */
interface RawTimeSeriesRow {
  date: string | Date;
  customers: number | string;
  subscriptions: number | string;
  trials: number | string;
  trialsApproved: number | string;
  upsells: number | string;
  upsellsApproved: number | string;
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

    // Build main time series query and standalone OTS time series query using shared builder
    const { query, params } = crmQueryBuilder.buildTimeSeriesQuery(dateRange);
    const { query: otsQuery, params: otsParams } = crmQueryBuilder.buildOtsTimeSeriesQuery(dateRange);

    // Execute both queries in parallel
    const [rows, otsRows] = await Promise.all([
      executeMariaDBQuery<RawTimeSeriesRow>(query, params),
      executeMariaDBQuery<{ date: string | Date; ots: number | string; otsApproved: number | string }>(otsQuery, otsParams),
    ]);

    // Build OTS lookup by date string
    const otsMap = new Map<string, { ots: number; otsApproved: number }>();
    for (const otsRow of otsRows) {
      const dateKey = otsRow.date instanceof Date
        ? formatMariaDBDateResult(otsRow.date)
        : String(otsRow.date).split('T')[0];
      otsMap.set(dateKey, {
        ots: Number(otsRow.ots) || 0,
        otsApproved: Number(otsRow.otsApproved) || 0,
      });
    }

    // Transform to frontend format, merging OTS data
    const data: TimeSeriesDataPoint[] = rows.map((row) => {
      const dateValue = row.date instanceof Date
        ? formatMariaDBDateResult(row.date)
        : String(row.date).split('T')[0];

      const otsData = otsMap.get(dateValue) || { ots: 0, otsApproved: 0 };

      return {
        date: dateValue,
        customers: Number(row.customers) || 0,
        subscriptions: Number(row.subscriptions) || 0,
        trials: Number(row.trials) || 0,
        ots: otsData.ots,
        otsApproved: otsData.otsApproved,
        trialsApproved: Number(row.trialsApproved) || 0,
        upsells: Number(row.upsells) || 0,
        upsellsApproved: Number(row.upsellsApproved) || 0,
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    unstable_rethrow(error);
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        {
          success: false,
          data: [],
          error: 'Invalid request data',
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
export const POST = withAuth(handleTimeSeriesQuery);

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
