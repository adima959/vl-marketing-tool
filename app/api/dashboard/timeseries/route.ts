import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { crmQueryBuilder } from '@/lib/server/crmQueryBuilder';
import { formatMariaDBDateResult } from '@/lib/server/crmMetrics';
import type { TimeSeriesDataPoint, TimeSeriesResponse } from '@/types/dashboard';
import { withPermission } from '@/lib/rbac';
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
  upsellSub: number | string;
  upsellOts: number | string;
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

    // Build main time series query, standalone OTS and trial time series queries
    const { query, params } = crmQueryBuilder.buildTimeSeriesQuery(dateRange);
    const { query: otsQuery, params: otsParams } = crmQueryBuilder.buildOtsTimeSeriesQuery(dateRange);
    const { query: trialQuery, params: trialParams } = crmQueryBuilder.buildTrialTimeSeriesQuery(dateRange);

    // Execute all three queries in parallel
    const [rows, otsRows, trialRows] = await Promise.all([
      executeMariaDBQuery<RawTimeSeriesRow>(query, params),
      executeMariaDBQuery<{ date: string | Date; ots: number | string; otsApproved: number | string }>(otsQuery, otsParams),
      executeMariaDBQuery<{ date: string | Date; trials: number | string; trialsApproved: number | string; onHold: number | string }>(trialQuery, trialParams),
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

    // Build trial lookup by date string (overrides main query's trial counts)
    const trialMap = new Map<string, { trials: number; trialsApproved: number; onHold: number }>();
    for (const trialRow of trialRows) {
      const dateKey = trialRow.date instanceof Date
        ? formatMariaDBDateResult(trialRow.date)
        : String(trialRow.date).split('T')[0];
      trialMap.set(dateKey, {
        trials: Number(trialRow.trials) || 0,
        trialsApproved: Number(trialRow.trialsApproved) || 0,
        onHold: Number(trialRow.onHold) || 0,
      });
    }

    // Collect all dates from main + trial queries (trial query may have dates outside s.date_create range)
    const allDates = new Set<string>();
    for (const row of rows) {
      const d = row.date instanceof Date ? formatMariaDBDateResult(row.date) : String(row.date).split('T')[0];
      allDates.add(d);
    }
    for (const d of trialMap.keys()) {
      allDates.add(d);
    }

    // Build a quick lookup of main query rows by date
    const mainRowMap = new Map<string, RawTimeSeriesRow>();
    for (const row of rows) {
      const d = row.date instanceof Date ? formatMariaDBDateResult(row.date) : String(row.date).split('T')[0];
      mainRowMap.set(d, row);
    }

    // Transform to frontend format, merging OTS and trial data
    const data: TimeSeriesDataPoint[] = [...allDates].sort().map((dateValue) => {
      const row = mainRowMap.get(dateValue);
      const otsData = otsMap.get(dateValue) || { ots: 0, otsApproved: 0 };
      const trialData = trialMap.get(dateValue);

      const trials = trialData ? trialData.trials : (row ? Number(row.trials) || 0 : 0);
      const trialsApproved = trialData ? trialData.trialsApproved : (row ? Number(row.trialsApproved) || 0 : 0);
      const onHold = trialData ? trialData.onHold : 0;

      return {
        date: dateValue,
        customers: row ? Number(row.customers) || 0 : 0,
        subscriptions: row ? Number(row.subscriptions) || 0 : 0,
        trials,
        ots: otsData.ots,
        otsApproved: otsData.otsApproved,
        trialsApproved,
        onHold,
        upsells: row ? Number(row.upsells) || 0 : 0,
        upsellSub: row ? Number(row.upsellSub) || 0 : 0,
        upsellOts: row ? Number(row.upsellOts) || 0 : 0,
        upsellsApproved: row ? Number(row.upsellsApproved) || 0 : 0,
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

// Export with permission-based authentication
export const POST = withPermission('analytics.dashboard', 'can_view', handleTimeSeriesQuery);

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
