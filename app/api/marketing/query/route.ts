import { NextRequest, NextResponse} from 'next/server';
import { getMarketingData, type MarketingQueryParams } from '@/lib/server/marketingQueryBuilder';
import type { QueryResponse } from '@/lib/types/api';
import { parseQueryRequest } from '@/lib/types/api';
import { maskErrorForClient } from '@/lib/types/errors';
import type { ReportRow } from '@/types/report';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { marketingQueryRequestSchema } from '@/lib/schemas/api';
import { toTitleCase } from '@/lib/formatters';
import { z } from 'zod';
import { unstable_rethrow } from 'next/navigation';

/**
 * POST /api/marketing/query
 * Marketing report API endpoint using two-database approach
 * Queries PostgreSQL for ads data and MariaDB for CRM data with product filtering
 * Requires admin authentication
 */
async function handleMarketingQuery(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse<QueryResponse>> {
  try {
    // Parse and validate request body with Zod
    const rawBody = await request.json();
    const body = marketingQueryRequestSchema.parse(rawBody);

    // Parse and build query parameters (omit productFilter, convert null to undefined)
    const { productFilter, sortBy, ...rest } = body;
    const queryParams = parseQueryRequest({
      ...rest,
      sortBy: sortBy ?? undefined,
    });

    // Build marketing query params with two-database approach
    const marketingParams: MarketingQueryParams = {
      dateRange: queryParams.dateRange,
      dimensions: queryParams.dimensions,
      depth: queryParams.depth,
      parentFilters: queryParams.parentFilters,
      filters: queryParams.filters,
      sortBy: queryParams.sortBy ?? undefined,
      sortDirection: queryParams.sortDirection,
      productFilter: body.productFilter ?? undefined,
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
    const currentDimension = body.dimensions[body.depth];
    const data: ReportRow[] = rows.map((row) => {
      // PG driver returns Date objects for date columns — cast to dd/mm/yyyy
      let dimValue: string;
      const raw: unknown = row.dimension_value;
      if (raw instanceof Date) {
        dimValue = `${String(raw.getUTCDate()).padStart(2, '0')}/${String(raw.getUTCMonth() + 1).padStart(2, '0')}/${raw.getUTCFullYear()}`;
      } else {
        dimValue = raw != null ? String(raw) : 'Unknown';
      }
      return {
      key: `${keyPrefix}${dimValue}`,
      attribute: currentDimension === 'classifiedCountry'
        ? dimValue.toUpperCase()
        : currentDimension === 'date' ? dimValue : toTitleCase(dimValue),
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
        customers: row.customers,
        subscriptions: row.subscriptions,
        trials: row.trials,
        trialsApproved: row.trials_approved,
        ots: row.ots,
        otsApproved: row.ots_approved,
        approvalRate: row.approval_rate,
        otsApprovalRate: row.ots_approval_rate,
        upsells: row.upsells,
        upsellsApproved: row.upsells_approved,
        upsellApprovalRate: row.upsell_approval_rate,
        realCpa: row.real_cpa,
      },
    };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    unstable_rethrow(error);
    // Handle Zod validation errors specifically
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
        },
        { status: 400 }
      );
    }

    const { message, statusCode } = maskErrorForClient(error, 'Marketing API');

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
export const POST = withAuth(handleMarketingQuery);

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
