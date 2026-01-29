import { NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { dashboardDetailQueryBuilder } from '@/lib/server/dashboardDetailQueryBuilder';
import type { DetailRecord, DetailQueryResponse } from '@/types/dashboardDetails';

/**
 * POST /api/dashboard/details
 *
 * Fetch individual detail records for a clicked metric
 *
 * Request body:
 * {
 *   metricId: 'customers' | 'subscriptions' | 'trials' | 'trialsApproved' | 'upsells',
 *   filters: {
 *     dateRange: { start: string, end: string },
 *     country?: string,
 *     product?: string,
 *     source?: string
 *   },
 *   pagination?: { page: number, pageSize: number }
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   data?: { records: DetailRecord[], total: number, page: number, pageSize: number },
 *   error?: string
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.metricId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: metricId' },
        { status: 400 }
      );
    }

    if (!body.filters?.dateRange?.start || !body.filters?.dateRange?.end) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: filters.dateRange' },
        { status: 400 }
      );
    }

    // Parse date range
    const dateRange = {
      start: new Date(body.filters.dateRange.start),
      end: new Date(body.filters.dateRange.end),
    };

    // Validate dates
    if (isNaN(dateRange.start.getTime()) || isNaN(dateRange.end.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format in dateRange' },
        { status: 400 }
      );
    }

    // Default pagination
    const pagination = body.pagination || { page: 1, pageSize: 50 };

    // Build queries
    const { query, params, countQuery, countParams } = dashboardDetailQueryBuilder.buildDetailQuery(
      body.metricId,
      {
        dateRange,
        country: body.filters.country,
        product: body.filters.product,
        source: body.filters.source,
      },
      pagination
    );

    // Execute queries in parallel
    const [records, countResult] = await Promise.all([
      executeMariaDBQuery<DetailRecord>(query, params),
      executeMariaDBQuery<{ total: number }>(countQuery, countParams),
    ]);

    const total = countResult[0]?.total || 0;

    const response: DetailQueryResponse = {
      success: true,
      data: {
        records,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Dashboard details query error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
