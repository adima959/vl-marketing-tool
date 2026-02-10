import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { dashboardDetailQueryBuilder } from '@/lib/server/dashboardDetailQueryBuilder';
import type { DetailRecord, DetailQueryResponse } from '@/types/dashboardDetails';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { maskErrorForClient } from '@/lib/types/errors';

/**
 * POST /api/dashboard/details
 *
 * Fetch individual detail records for a clicked metric
 * Requires admin authentication
 *
 * Request body:
 * {
 *   metricId: 'customers' | 'subscriptions' | 'trials' | 'ots' | 'trialsApproved' | 'upsells',
 *   filters: {
 *     dateRange: { start: string, end: string },
 *     country?: string,
 *     product?: string,
 *     source?: string,
 *     excludeDeleted?: boolean,     // If true, exclude deleted subscriptions (s.deleted = 0)
 *     excludeUpsellTags?: boolean   // If true, exclude upsell invoices (i.tag NOT LIKE '%parent-sub-id=%')
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
async function handleDashboardDetails(
  request: NextRequest,
  _user: AppUser
) {
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
    const { query, params, countQuery, countParams} = dashboardDetailQueryBuilder.buildDetailQuery(
      body.metricId,
      {
        dateRange,
        country: body.filters.country,
        product: body.filters.product,
        source: body.filters.source,
        excludeDeleted: body.filters.excludeDeleted,
        excludeUpsellTags: body.filters.excludeUpsellTags,
        rateType: body.filters.rateType,
      },
      pagination
    );

    // Execute queries in parallel
    const [rawRecords, countResult] = await Promise.all([
      executeMariaDBQuery<Record<string, unknown>>(query, params),
      executeMariaDBQuery<{ total: number }>(countQuery, countParams),
    ]);

    const total = Number(countResult[0]?.total) || 0;

    // Normalize numeric fields — mysql2 binary protocol can return
    // computed columns (MAX, IF, etc.) as unexpected types (Buffer, string, BigInt)
    const records: DetailRecord[] = rawRecords.map((row) => ({
      ...row,
      isApproved: Number(row.isApproved) || 0,
      isOnHold: Number(row.isOnHold) || 0,
      subscriptionStatus: Number(row.subscriptionStatus) || 0,
      amount: Number(row.amount) || 0,
      customerId: Number(row.customerId) || 0,
    })) as DetailRecord[];

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
    const { message, statusCode } = maskErrorForClient(error, 'Dashboard Details API');

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
export const POST = withAuth(handleDashboardDetails);
