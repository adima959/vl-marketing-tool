import { NextRequest, NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { executeQuery } from '@/lib/server/db';
import { marketingDetailQueryBuilder } from '@/lib/server/marketingDetailQueryBuilder';
import type { DetailRecord } from '@/types/dashboardDetails';
import type { MarketingDetailResponse } from '@/types/marketingDetails';
import { withAdmin } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { maskErrorForClient } from '@/lib/types/errors';

/**
 * Resolve campaign/adset/ad names to their IDs using PostgreSQL ads database
 * Returns arrays of IDs that match the given names within the date range
 */
async function resolveMarketingIdsFromNames(
  dateRange: { start: Date; end: Date },
  filters: {
    network?: string;
    campaign?: string;
    adset?: string;
    ad?: string;
  }
): Promise<{
  campaignIds: string[];
  adsetIds: string[];
  adIds: string[];
}> {
  const params: any[] = [
    dateRange.start.toISOString().split('T')[0],
    dateRange.end.toISOString().split('T')[0],
  ];

  const conditions: string[] = ['date::date BETWEEN $1::date AND $2::date'];

  if (filters.network) {
    params.push(filters.network);
    conditions.push(`network = $${params.length}`);
  }

  if (filters.campaign) {
    params.push(filters.campaign);
    conditions.push(`campaign_name = $${params.length}`);
  }

  if (filters.adset) {
    params.push(filters.adset);
    conditions.push(`adset_name = $${params.length}`);
  }

  if (filters.ad) {
    params.push(filters.ad);
    conditions.push(`ad_name = $${params.length}`);
  }

  const query = `
    SELECT DISTINCT
      campaign_id,
      adset_id,
      ad_id
    FROM merged_ads_spending
    WHERE ${conditions.join(' AND ')}
  `;

  const results = await executeQuery<{
    campaign_id: string;
    adset_id: string;
    ad_id: string;
  }>(query, params);

  // Extract unique IDs
  const campaignIds = [...new Set(results.map(r => r.campaign_id).filter(Boolean))];
  const adsetIds = [...new Set(results.map(r => r.adset_id).filter(Boolean))];
  const adIds = [...new Set(results.map(r => r.ad_id).filter(Boolean))];

  return { campaignIds, adsetIds, adIds };
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

    // Resolve campaign/adset/ad names to IDs using PostgreSQL
    // This is necessary because Marketing Report shows names but CRM stores IDs in tracking fields
    const { campaignIds, adsetIds, adIds } = await resolveMarketingIdsFromNames(
      dateRange,
      {
        network: body.filters.network,
        campaign: body.filters.campaign,
        adset: body.filters.adset,
        ad: body.filters.ad,
      }
    );

    // If we have filters but no matching IDs found, return empty result
    if (
      (body.filters.campaign && campaignIds.length === 0) ||
      (body.filters.adset && adsetIds.length === 0) ||
      (body.filters.ad && adIds.length === 0)
    ) {
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

    // Build queries with resolved IDs
    const { query, params, countQuery, countParams } = marketingDetailQueryBuilder.buildDetailQuery(
      body.metricId,
      {
        dateRange,
        network: body.filters.network,
        campaignIds: body.filters.campaign ? campaignIds : undefined,
        adsetIds: body.filters.adset ? adsetIds : undefined,
        adIds: body.filters.ad ? adIds : undefined,
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
export const POST = withAdmin(handleMarketingDetails);
