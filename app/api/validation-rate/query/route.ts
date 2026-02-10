import { NextRequest, NextResponse } from 'next/server';
import { getValidationRateData } from '@/lib/server/validationRateQueryBuilder';
import { maskErrorForClient } from '@/lib/types/errors';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { validationRateQueryRequestSchema } from '@/lib/schemas/api';
import type { ValidationRateResponse, ValidationRateQueryParams } from '@/types';
import { z } from 'zod';

/**
 * POST /api/validation-rate/query
 *
 * Validation Rate Report API endpoint
 * Handles all rate types: approval, pay, buy
 * Queries MariaDB CRM data for rates by dimension and time period
 * Requires admin authentication
 */
async function handleValidationRateQuery(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse<ValidationRateResponse>> {
  try {
    // Parse and validate request body with Zod
    const rawBody = await request.json();
    const body = validationRateQueryRequestSchema.parse(rawBody);

    // Build query parameters
    const queryParams: ValidationRateQueryParams = {
      rateType: body.rateType,
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
    const result = await getValidationRateData(queryParams);

    return NextResponse.json(result);
  } catch (error: unknown) {
    // Handle Zod validation errors specifically
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        {
          success: false,
          data: [],
          periodColumns: [],
          error: 'Invalid request data',
        },
        { status: 400 }
      );
    }

    const { message, statusCode } = maskErrorForClient(error, 'Validation Rate API');

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
export const POST = withAuth(handleValidationRateQuery);

/**
 * GET /api/validation-rate/query
 * Health check endpoint
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/validation-rate/query',
    methods: ['POST'],
    description: 'Validation Rate pivot report - approval, pay, buy (MariaDB CRM)',
    timestamp: new Date().toISOString(),
  });
}
