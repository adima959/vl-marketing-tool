import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withAdmin } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

/**
 * GET /api/debug/raw-campaign-data?campaign=Balansera_Dnk_IM_24_11&start=2026-01-01&end=2026-02-02
 *
 * Debug endpoint to query raw campaign data from merged_ads_spending table
 * Shows all individual rows for a campaign to verify data integrity
 */
async function handleRawCampaignData(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const campaignName = searchParams.get('campaign');
    const startDate = searchParams.get('start') || '2026-01-01';
    const endDate = searchParams.get('end') || '2026-02-02';

    if (!campaignName) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameter: campaign',
        },
        { status: 400 }
      );
    }

    // Query 1: Get ALL raw rows for this campaign
    const rawRowsQuery = `
      SELECT
        date,
        network,
        campaign_id,
        campaign_name,
        adset_id,
        adset_name,
        ad_id,
        ad_name,
        cost,
        clicks,
        impressions,
        conversions,
        ctr_percent,
        cpc,
        cpm
      FROM merged_ads_spending
      WHERE campaign_name = $1
        AND date BETWEEN $2 AND $3
      ORDER BY date DESC, clicks DESC
    `;

    const rawRows = await executeQuery(rawRowsQuery, [campaignName, startDate, endDate]);

    // Query 2: Get aggregated totals for verification
    const aggregatedQuery = `
      SELECT
        campaign_name,
        COUNT(*) as row_count,
        SUM(clicks::integer) as total_clicks,
        SUM(impressions::integer) as total_impressions,
        ROUND(SUM(cost::numeric), 2) as total_cost,
        ROUND(SUM(conversions::numeric), 0) as total_conversions,
        COUNT(DISTINCT date) as distinct_dates,
        COUNT(DISTINCT adset_id) as distinct_adsets,
        COUNT(DISTINCT ad_id) as distinct_ads
      FROM merged_ads_spending
      WHERE campaign_name = $1
        AND date BETWEEN $2 AND $3
      GROUP BY campaign_name
    `;

    const aggregated = await executeQuery(aggregatedQuery, [campaignName, startDate, endDate]);

    // Query 3: Get daily aggregation to spot any date-related issues
    const dailyAggQuery = `
      SELECT
        date,
        SUM(clicks::integer) as daily_clicks,
        SUM(impressions::integer) as daily_impressions,
        ROUND(SUM(cost::numeric), 2) as daily_cost,
        COUNT(*) as row_count
      FROM merged_ads_spending
      WHERE campaign_name = $1
        AND date BETWEEN $2 AND $3
      GROUP BY date
      ORDER BY date DESC
    `;

    const dailyAgg = await executeQuery(dailyAggQuery, [campaignName, startDate, endDate]);

    return NextResponse.json({
      success: true,
      data: {
        campaign: campaignName,
        dateRange: { start: startDate, end: endDate },
        summary: aggregated[0] || null,
        dailyAggregation: dailyAgg,
        rawRowCount: rawRows.length,
        rawRowsSample: rawRows.slice(0, 20), // First 20 rows for inspection
        rawRowsTotal: rawRows.length,
      },
      meta: {
        timestamp: new Date().toISOString(),
        note: 'This shows raw database data before any dashboard aggregation logic',
      },
    });
  } catch (error: unknown) {
    console.error('[DEBUG] Raw campaign data error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleRawCampaignData);
