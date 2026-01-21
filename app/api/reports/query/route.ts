import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { queryBuilder } from '@/lib/server/queryBuilder';
import type { AggregatedMetrics } from '@/lib/server/types';
import type { QueryRequest, QueryResponse } from '@/lib/types/api';
import { parseQueryRequest } from '@/lib/types/api';
import { createValidationError, normalizeError } from '@/lib/types/errors';

/**
 * POST /api/reports/query
 * Main API endpoint for querying report data
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<QueryResponse>> {
  try {
    // Parse request body
    const body: QueryRequest = await request.json();

    // Validate required fields
    if (!body.dateRange?.start || !body.dateRange?.end) {
      const error = createValidationError('dateRange is required');
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    if (!Array.isArray(body.dimensions) || body.dimensions.length === 0) {
      const error = createValidationError('dimensions array is required');
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    if (typeof body.depth !== 'number' || body.depth < 0) {
      const error = createValidationError('depth must be a non-negative number');
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    // Parse and build SQL query
    const queryParams = parseQueryRequest(body);
    const { query, params } = queryBuilder.buildQuery(queryParams);

    // Execute query
    const rows = await executeQuery<AggregatedMetrics>(query, params);

    // Check if there are more dimensions (children available)
    const hasMoreDimensions = body.depth < body.dimensions.length - 1;

    // Build key prefix from parent filters to ensure uniqueness
    // IMPORTANT: Must maintain dimension order from body.dimensions array, not alphabetical
    const parentKeyParts = body.parentFilters
      ? body.dimensions
          .map((dim) => body.parentFilters?.[dim])
          .filter((val): val is string => val !== undefined)
          .join('::')
      : '';
    const keyPrefix = parentKeyParts ? `${parentKeyParts}::` : '';

    // Transform database rows to frontend format
    const data = rows.map((row) => {
      const cost = Number(row.cost) || 0;
      const crmSubscriptions = Number(row.crm_subscriptions) || 0;
      const approvedSales = Number(row.approved_sales) || 0;
      const realCpa = approvedSales > 0 ? cost / approvedSales : 0;
      const approvalRate = crmSubscriptions > 0 ? approvedSales / crmSubscriptions : 0;

      return {
        key: `${keyPrefix}${row.dimension_value || '(not set)'}`,
        attribute: row.dimension_value || '(not set)',
        depth: body.depth,
        hasChildren: hasMoreDimensions,
        metrics: {
          cost,
          clicks: Number(row.clicks) || 0,
          impressions: Number(row.impressions) || 0,
          conversions: Number(row.conversions) || 0,
          ctr: Number(row.ctr_percent) || 0,
          cpc: Number(row.cpc) || 0,
          cpm: Number(row.cpm) || 0,
          conversionRate: Number(row.conversion_rate) || 0,
          crmSubscriptions,
          approvedSales,
          approvalRate,
          realCpa,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const appError = normalizeError(error);

    console.error('API error:', {
      code: appError.code,
      message: appError.message,
      statusCode: appError.statusCode,
      details: appError.details,
    });

    return NextResponse.json(
      {
        success: false,
        error: appError.message,
      },
      { status: appError.statusCode }
    );
  }
}

/**
 * GET /api/reports/query
 * Health check endpoint
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/reports/query',
    methods: ['POST'],
    timestamp: new Date().toISOString(),
  });
}
