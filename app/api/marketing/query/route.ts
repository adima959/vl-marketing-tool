import { NextRequest, NextResponse } from 'next/server';
import { getMarketingData, type MarketingQueryParams } from '@/lib/server/marketingQueryBuilder';
import type { QueryRequest, QueryResponse } from '@/lib/types/api';
import { parseQueryRequest } from '@/lib/types/api';
import { createValidationError, normalizeError } from '@/lib/types/errors';
import type { ReportRow } from '@/types/report';

/**
 * POST /api/marketing/query
 * Marketing report API endpoint using two-database approach
 * Queries PostgreSQL for ads data and MariaDB for CRM data with product filtering
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<QueryResponse>> {
  try {
    // Parse request body (same format as /api/reports/query)
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

    // Parse and build query parameters
    const queryParams = parseQueryRequest(body);

    // Build marketing query params with two-database approach
    const marketingParams: MarketingQueryParams = {
      dateRange: queryParams.dateRange,
      dimensions: queryParams.dimensions,
      depth: queryParams.depth,
      parentFilters: queryParams.parentFilters,
      sortBy: queryParams.sortBy,
      sortDirection: queryParams.sortDirection,
      productFilter: (body as any).productFilter, // Optional product filter
    };

    // Execute query with two-database approach
    const rows = await getMarketingData(marketingParams);

    // Check if there are more dimensions (children available)
    const hasMoreDimensions = body.depth < body.dimensions.length - 1;

    // Build key prefix from parent filters
    const parentKeyParts = body.parentFilters
      ? body.dimensions
          .map((dim) => body.parentFilters?.[dim])
          .filter((val): val is string => val !== undefined)
          .join('::')
      : '';
    const keyPrefix = parentKeyParts ? `${parentKeyParts}::` : '';

    // Transform database rows to frontend format (same as /api/reports/query)
    const data: ReportRow[] = rows.map((row) => ({
      key: `${keyPrefix}${row.dimension_value || '(not set)'}`,
      attribute: row.dimension_value || '(not set)',
      depth: body.depth,
      hasChildren: hasMoreDimensions,
      metrics: {
        cost: row.cost,
        clicks: row.clicks,
        impressions: row.impressions,
        conversions: row.conversions,
        ctr: row.ctr_percent,
        cpc: row.cpc,
        cpm: row.cpm,
        conversionRate: row.conversion_rate,
        crmSubscriptions: row.crm_subscriptions,
        approvedSales: row.approved_sales,
        approvalRate: row.approval_rate,
        realCpa: row.real_cpa,
      },
    }));

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    // Log the original error first
    console.error('Marketing API original error:', error);
    console.error('Error type:', typeof error);
    console.error('Error constructor:', error?.constructor?.name);

    const appError = normalizeError(error);

    console.error('Marketing API normalized error:', {
      code: appError.code,
      message: appError.message,
      statusCode: appError.statusCode,
      details: appError.details,
    });

    return NextResponse.json(
      {
        success: false,
        error: appError.message || 'Unknown error occurred',
      },
      { status: appError.statusCode }
    );
  }
}

/**
 * GET /api/marketing/query
 * Health check endpoint
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/marketing/query',
    methods: ['POST'],
    description: 'Two-database marketing report (PostgreSQL + MariaDB with product filtering)',
    timestamp: new Date().toISOString(),
  });
}
