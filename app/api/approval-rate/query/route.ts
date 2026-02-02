import { NextRequest, NextResponse } from 'next/server';
import { getApprovalRateData } from '@/lib/server/approvalRateQueryBuilder';
import { maskErrorForClient } from '@/lib/types/errors';
import { withAdmin } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { approvalRateQueryRequestSchema } from '@/lib/schemas/api';
import type { ApprovalRateResponse, ApprovalRateQueryParams } from '@/types';
import { z } from 'zod';

/**
 * POST /api/approval-rate/query
 *
 * Approval Rate Report API endpoint
 * Queries MariaDB CRM data for approval rates by dimension and time period
 * Requires admin authentication
 */
async function handleApprovalRateQuery(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse<ApprovalRateResponse>> {
  try {
    // Parse and validate request body with Zod
    const rawBody = await request.json();
    const body = approvalRateQueryRequestSchema.parse(rawBody);

    // Build query parameters
    const queryParams: ApprovalRateQueryParams = {
      dateRange: {
        start: new Date(body.dateRange.start),
        end: new Date(body.dateRange.end),
      },
      dimensions: body.dimensions,
      depth: body.depth,
      parentFilters: body.parentFilters,
      timePeriod: body.timePeriod,
      sortBy: body.sortBy,
      sortDirection: body.sortDirection,
    };

    // Execute query
    const result = await getApprovalRateData(queryParams);

    return NextResponse.json(result);
  } catch (error: unknown) {
    // Handle Zod validation errors specifically
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          data: [],
          periodColumns: [],
          error: `Validation error: ${error.message}`,
        },
        { status: 400 }
      );
    }

    const { message, statusCode } = maskErrorForClient(error, 'Approval Rate API');

    return NextResponse.json(
      {
        success: false,
        data: [],
        periodColumns: [],
        error: message,
      },
      { status: statusCode }
    );
  }
}

// Export with admin authentication
export const POST = withAdmin(handleApprovalRateQuery);

/**
 * GET /api/approval-rate/query
 * Health check endpoint
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/approval-rate/query',
    methods: ['POST'],
    description: 'Approval Rate pivot report (MariaDB CRM)',
    timestamp: new Date().toISOString(),
  });
}
