import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { queryBuilder } from '@/lib/server/queryBuilder';
import type { AggregatedMetrics } from '@/lib/server/types';

/**
 * Request body interface
 */
interface QueryRequest {
  dateRange: {
    start: string; // ISO date string
    end: string;
  };
  dimensions: string[];
  depth: number;
  parentFilters?: Record<string, string>;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

/**
 * Response interface
 */
interface QueryResponse {
  success: boolean;
  data?: Array<{
    key: string;
    attribute: string;
    depth: number;
    hasChildren: boolean;
    metrics: {
      cost: number;
      clicks: number;
      impressions: number;
      conversions: number;
      ctr: number;
      cpc: number;
      cpm: number;
      conversionRate: number;
    };
  }>;
  error?: string;
  cached?: boolean;
}

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
      return NextResponse.json(
        { success: false, error: 'dateRange is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.dimensions) || body.dimensions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'dimensions array is required' },
        { status: 400 }
      );
    }

    if (typeof body.depth !== 'number' || body.depth < 0) {
      return NextResponse.json(
        { success: false, error: 'depth must be a non-negative number' },
        { status: 400 }
      );
    }

    // Build SQL query
    const { query, params } = queryBuilder.buildQuery({
      dateRange: {
        start: new Date(body.dateRange.start),
        end: new Date(body.dateRange.end),
      },
      dimensions: body.dimensions,
      depth: body.depth,
      parentFilters: body.parentFilters,
      sortBy: body.sortBy,
      sortDirection: body.sortDirection,
    });

    // Execute query
    const rows = await executeQuery<AggregatedMetrics>(query, params);

    // Check if there are more dimensions (children available)
    const hasMoreDimensions = body.depth < body.dimensions.length - 1;

    // Transform database rows to frontend format
    const data = rows.map((row, index) => ({
      key: `depth-${body.depth}-${index}`,
      attribute: row.dimension_value || '(not set)',
      depth: body.depth,
      hasChildren: hasMoreDimensions,
      metrics: {
        cost: Number(row.cost) || 0,
        clicks: Number(row.clicks) || 0,
        impressions: Number(row.impressions) || 0,
        conversions: Number(row.conversions) || 0,
        ctr: Number(row.ctr_percent) || 0,
        cpc: Number(row.cpc) || 0,
        cpm: Number(row.cpm) || 0,
        conversionRate: Number(row.conversion_rate) || 0,
      },
    }));

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('API error:', {
      message: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
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
