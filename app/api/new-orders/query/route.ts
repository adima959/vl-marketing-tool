import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { newOrdersQueryBuilder } from '@/lib/server/newOrdersQueryBuilder';
import type { NewOrdersRow } from '@/types/newOrders';

interface QueryRequest {
  dateRange: { start: string; end: string };
  dimensions: string[];
  depth: number;
  parentFilters?: Record<string, string>;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

interface NewOrdersQueryResponse {
  success: boolean;
  data?: NewOrdersRow[];
  error?: string;
}

/**
 * POST /api/new-orders/query
 * Main API endpoint for querying new orders data from MariaDB
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<NewOrdersQueryResponse>> {
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

    // Convert ISO date strings back to Date objects
    const dateRange = {
      start: new Date(body.dateRange.start),
      end: new Date(body.dateRange.end),
    };

    // Build SQL query using MariaDB query builder
    const { query, params } = newOrdersQueryBuilder.buildQuery({
      dateRange,
      dimensions: body.dimensions,
      depth: body.depth,
      parentFilters: body.parentFilters,
      sortBy: body.sortBy || 'subscriptions',
      sortDirection: body.sortDirection || 'DESC',
      limit: 1000,
    });

    // Execute query against MariaDB
    const rows = await executeMariaDBQuery<any>(query, params);

    // Check if there are more dimensions (children available)
    const hasMoreDimensions = body.depth < body.dimensions.length - 1;

    // Build key prefix from parent filters (maintain dimension order)
    const parentKeyParts = body.parentFilters
      ? body.dimensions
          .map((dim) => body.parentFilters?.[dim])
          .filter((val): val is string => val !== undefined)
          .join('::')
      : '';
    const keyPrefix = parentKeyParts ? `${parentKeyParts}::` : '';

    // Transform database rows to frontend format
    let data: NewOrdersRow[];

    if (body.depth === 0) {
      // Depth 0: Country aggregation
      data = rows.map((row) => ({
        key: `${keyPrefix}${row.country || '(not set)'}`,
        attribute: row.country || '(not set)',
        depth: body.depth,
        hasChildren: hasMoreDimensions,
        metrics: {
          subscriptions: Number(row.subscription_count) || 0,
          ots: Number(row.ots_count) || 0,
          trials: Number(row.trial_count) || 0,
          customers: Number(row.customer_count) || 0,
        },
      }));
    } else if (body.depth === 1) {
      // Depth 1: Product aggregation
      data = rows.map((row) => ({
        key: `${keyPrefix}${row.product_name || '(not set)'}`,
        attribute: row.product_name || '(not set)',
        depth: body.depth,
        hasChildren: hasMoreDimensions,
        metrics: {
          subscriptions: Number(row.subscription_count) || 0,
          ots: Number(row.ots_count) || 0,
          trials: Number(row.trial_count) || 0,
          customers: Number(row.customer_count) || 0,
        },
      }));
    } else {
      // Depth 2: Individual orders
      // Each row represents one subscription with its counts
      data = rows.map((row) => {
        // Format attribute: "ID: {id} {product_name} - {source}"
        // Note: product_name includes campaign details from database
        const attributeText = `ID: ${row.subscription_id} ${row.product_name || 'Unknown'} - ${row.source || 'Unknown'}`;

        return {
          key: `${keyPrefix}${row.subscription_id}`,
          attribute: attributeText,
          depth: body.depth,
          hasChildren: false, // Leaf nodes
          metrics: {
            subscriptions: 1, // Each row is 1 subscription
            ots: Number(row.ots_count) || 0, // Actual count per subscription
            trials: Number(row.trial_count) || 0, // Actual count per subscription
            customers: 1, // Each subscription = 1 customer at this level
          },
        };
      });
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    console.error('New Orders API error:', error);

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

/**
 * GET /api/new-orders/query
 * Health check endpoint
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/new-orders/query',
    methods: ['POST'],
    timestamp: new Date().toISOString(),
  });
}
