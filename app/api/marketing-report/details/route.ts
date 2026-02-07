import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { executeQuery } from '@/lib/server/db';
import { marketingDetailQueryBuilder } from '@/lib/server/marketingDetailQueryBuilder';
import type { DetailRecord } from '@/types/dashboardDetails';
import type { MarketingDetailResponse } from '@/types/marketingDetails';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { maskErrorForClient } from '@/lib/types/errors';

interface TrackingIdTuple {
  campaign_id: string;
  adset_id: string;
  ad_id: string;
}

/**
 * Format a Date as 'YYYY-MM-DD' using UTC methods
 * Input dates are parsed from YYYY-MM-DD strings (UTC midnight),
 * so UTC methods preserve the correct date regardless of server timezone
 */
function formatDateAsYMD(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolve tracking ID tuples from PostgreSQL for the given filters.
 * Returns the full set of (campaign_id, adset_id, ad_id) tuples that match,
 * preserving the relationship between IDs. These tuples are passed directly
 * to the CRM query to filter subscriptions by exact ad combinations.
 */
async function resolveTrackingIdTuples(
  dateRange: { start: Date; end: Date },
  filters: {
    network?: string;
    campaign?: string;
    adset?: string;
    ad?: string;
    date?: string;
  }
): Promise<TrackingIdTuple[]> {
  const params: any[] = [
    formatDateAsYMD(dateRange.start),
    formatDateAsYMD(dateRange.end),
  ];

  const conditions: string[] = [
    'date::date BETWEEN $1::date AND $2::date',
    'campaign_id IS NOT NULL',
    'adset_id IS NOT NULL',
    'ad_id IS NOT NULL',
  ];

  if (filters.network) {
    if (filters.network === 'Unknown') {
      conditions.push('network IS NULL');
    } else {
      params.push(filters.network);
      conditions.push(`network = $${params.length}`);
    }
  }

  if (filters.campaign) {
    if (filters.campaign === 'Unknown') {
      conditions.push('campaign_name IS NULL');
    } else {
      params.push(filters.campaign);
      conditions.push(`campaign_name = $${params.length}`);
    }
  }

  if (filters.adset) {
    if (filters.adset === 'Unknown') {
      conditions.push('adset_name IS NULL');
    } else {
      params.push(filters.adset);
      conditions.push(`adset_name = $${params.length}`);
    }
  }

  if (filters.ad) {
    if (filters.ad === 'Unknown') {
      conditions.push('ad_name IS NULL');
    } else {
      params.push(filters.ad);
      conditions.push(`ad_name = $${params.length}`);
    }
  }

  if (filters.date) {
    params.push(filters.date);
    conditions.push(`date::date = $${params.length}::date`);
  }

  const query = `
    SELECT DISTINCT campaign_id, adset_id, ad_id
    FROM merged_ads_spending
    WHERE ${conditions.join(' AND ')}
  `;

  return executeQuery<TrackingIdTuple>(query, params);
}

/**
 * POST /api/marketing-report/details
 *
 * Fetch individual CRM detail records for a clicked metric in Marketing Report
 * Requires admin authentication
 *
 * Request body:
 * {
 *   metricId: 'crmSubscriptions' | 'approvedSales',
 *   filters: {
 *     dateRange: { start: string, end: string },
 *     network?: string,    // Maps to source
 *     campaign?: string,   // Maps to tracking_id_4
 *     adset?: string,      // Maps to tracking_id_2
 *     ad?: string,         // Maps to tracking_id
 *     date?: string        // Specific date filter
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
async function handleMarketingDetails(
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

    if (!['crmSubscriptions', 'approvedSales'].includes(body.metricId)) {
      return NextResponse.json(
        { success: false, error: `Invalid metricId: ${body.metricId}. Must be 'crmSubscriptions' or 'approvedSales'` },
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

    // Resolve tracking ID tuples from PostgreSQL
    // Always resolve all matching (campaign_id, adset_id, ad_id) tuples
    // regardless of which dimension filters are provided
    const trackingIdTuples = await resolveTrackingIdTuples(
      dateRange,
      {
        network: body.filters.network,
        campaign: body.filters.campaign,
        adset: body.filters.adset,
        ad: body.filters.ad,
        date: body.filters.date,
      }
    );

    // If no matching tuples found, no CRM records can match
    if (trackingIdTuples.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          records: [],
          total: 0,
          page: pagination.page,
          pageSize: pagination.pageSize,
        },
      });
    }

    // Build queries with resolved ID tuples
    const { query, params, countQuery, countParams } = marketingDetailQueryBuilder.buildDetailQuery(
      body.metricId,
      {
        dateRange,
        trackingIdTuples,
        date: body.filters.date,
      },
      pagination
    );

    // Execute queries in parallel
    const [records, countResult] = await Promise.all([
      executeMariaDBQuery<DetailRecord>(query, params),
      executeMariaDBQuery<{ total: number }>(countQuery, countParams),
    ]);

    const total = countResult[0]?.total || 0;

    const response: MarketingDetailResponse = {
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
    const { message, statusCode } = maskErrorForClient(error, 'Marketing Details API');

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
export const POST = withAuth(handleMarketingDetails);
