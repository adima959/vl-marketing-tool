import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withAdmin } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

/**
 * GET /api/debug/compare-aggregations?campaign=Balansera_Dnk_IM_24_11&start=2026-01-01&end=2026-02-02
 *
 * Debug endpoint to compare different aggregation methods
 * Helps identify if the issue is with GROUP BY, date filtering, or data type casting
 */
async function handleCompareAggregations(
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

    const results: any = {
      campaign: campaignName,
      dateRange: { start: startDate, end: endDate },
      aggregations: {},
    };

    // Test 1: Simple SUM without GROUP BY (baseline truth)
    const simpleSumQuery = `
      SELECT
        'Baseline: Simple SUM' as method,
        SUM(clicks::integer) as total_clicks,
        SUM(impressions::integer) as total_impressions,
        ROUND(SUM(cost::numeric), 2) as total_cost,
        COUNT(*) as row_count
      FROM merged_ads_spending
      WHERE campaign_name = $1
        AND date BETWEEN $2 AND $3
    `;

    const simpleSum = await executeQuery(simpleSumQuery, [campaignName, startDate, endDate]) as any[];
    results.aggregations.simpleSum = simpleSum[0];

    // Test 2: GROUP BY campaign_name (what dashboard does at depth 0)
    const groupByCampaignQuery = `
      SELECT
        'GROUP BY campaign_name' as method,
        campaign_name,
        SUM(clicks::integer) as total_clicks,
        SUM(impressions::integer) as total_impressions,
        ROUND(SUM(cost::numeric), 2) as total_cost,
        COUNT(*) as row_count
      FROM merged_ads_spending
      WHERE campaign_name = $1
        AND date BETWEEN $2 AND $3
      GROUP BY campaign_name
    `;

    const groupByCampaign = await executeQuery(groupByCampaignQuery, [campaignName, startDate, endDate]) as any[];
    results.aggregations.groupByCampaign = groupByCampaign[0];

    // Test 3: Check for NULL or empty clicks
    const nullCheckQuery = `
      SELECT
        'NULL/Empty Check' as method,
        COUNT(*) as total_rows,
        COUNT(clicks) as non_null_clicks,
        SUM(CASE WHEN clicks IS NULL THEN 1 ELSE 0 END) as null_clicks,
        SUM(CASE WHEN clicks = 0 THEN 1 ELSE 0 END) as zero_clicks,
        SUM(CASE WHEN clicks > 0 THEN 1 ELSE 0 END) as positive_clicks
      FROM merged_ads_spending
      WHERE campaign_name = $1
        AND date BETWEEN $2 AND $3
    `;

    const nullCheck = await executeQuery(nullCheckQuery, [campaignName, startDate, endDate]) as any[];
    results.aggregations.nullCheck = nullCheck[0];

    // Test 4: Check data type issues
    const dataTypeQuery = `
      SELECT
        'Data Type Test' as method,
        SUM(clicks) as sum_no_cast,
        SUM(clicks::integer) as sum_integer_cast,
        SUM(clicks::numeric) as sum_numeric_cast,
        SUM(CAST(clicks AS INTEGER)) as sum_cast_function
      FROM merged_ads_spending
      WHERE campaign_name = $1
        AND date BETWEEN $2 AND $3
    `;

    const dataType = await executeQuery(dataTypeQuery, [campaignName, startDate, endDate]) as any[];
    results.aggregations.dataType = dataType[0];

    // Test 5: Check for duplicate rows
    const duplicateCheckQuery = `
      SELECT
        'Duplicate Check' as method,
        date,
        ad_id,
        COUNT(*) as duplicate_count,
        SUM(clicks::integer) as clicks_sum
      FROM merged_ads_spending
      WHERE campaign_name = $1
        AND date BETWEEN $2 AND $3
      GROUP BY date, ad_id
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
      LIMIT 10
    `;

    const duplicateCheck = await executeQuery(duplicateCheckQuery, [campaignName, startDate, endDate]) as any[];
    results.aggregations.duplicateCheck = {
      duplicatesFound: duplicateCheck.length,
      samples: duplicateCheck,
    };

    // Test 6: Check date boundary issues
    const dateBoundaryQuery = `
      SELECT
        'Date Boundary Check' as method,
        date,
        COUNT(*) as row_count,
        SUM(clicks::integer) as clicks,
        CASE
          WHEN date < $2::date THEN 'Before start'
          WHEN date > $3::date THEN 'After end'
          ELSE 'In range'
        END as boundary_status
      FROM merged_ads_spending
      WHERE campaign_name = $1
      GROUP BY date
      ORDER BY date DESC
    `;

    const dateBoundary = await executeQuery(dateBoundaryQuery, [campaignName, startDate, endDate]) as any[];
    results.aggregations.dateBoundary = {
      totalDates: dateBoundary.length,
      inRange: dateBoundary.filter((r: any) => r.boundary_status === 'In range').length,
      beforeStart: dateBoundary.filter((r: any) => r.boundary_status === 'Before start').length,
      afterEnd: dateBoundary.filter((r: any) => r.boundary_status === 'After end').length,
      samples: dateBoundary.slice(0, 10),
    };

    // Test 7: Check exact date filtering
    const exactDateFilterQuery = `
      SELECT
        'Exact Date Filter' as method,
        COUNT(*) as rows_with_between,
        SUM(clicks::integer) as clicks_with_between
      FROM merged_ads_spending
      WHERE campaign_name = $1
        AND date BETWEEN $2 AND $3
    `;

    const exactDateFilter = await executeQuery(exactDateFilterQuery, [campaignName, startDate, endDate]) as any[];
    results.aggregations.exactDateFilter = exactDateFilter[0];

    // Test 8: Check all dates for this campaign (no filter)
    const allDatesQuery = `
      SELECT
        'All Dates (No Filter)' as method,
        COUNT(*) as total_rows,
        SUM(clicks::integer) as total_clicks,
        MIN(date) as earliest_date,
        MAX(date) as latest_date
      FROM merged_ads_spending
      WHERE campaign_name = $1
    `;

    const allDates = await executeQuery(allDatesQuery, [campaignName]) as any[];
    results.aggregations.allDates = allDates[0];

    // Analysis: Identify discrepancies
    const baselineClicks = Number(simpleSum[0]?.total_clicks || 0);
    const groupByClicks = Number(groupByCampaign[0]?.total_clicks || 0);

    results.analysis = {
      baselineClicks,
      groupByClicks,
      discrepancy: baselineClicks - groupByClicks,
      discrepancyPercent: baselineClicks > 0 ? ((baselineClicks - groupByClicks) / baselineClicks * 100).toFixed(2) + '%' : '0%',
      possibleIssues: [],
    };

    if (baselineClicks !== groupByClicks) {
      results.analysis.possibleIssues.push('GROUP BY causing data loss or duplication');
    }

    if (nullCheck[0]?.null_clicks > 0) {
      results.analysis.possibleIssues.push(`${nullCheck[0].null_clicks} rows have NULL clicks`);
    }

    if (duplicateCheck.length > 0) {
      results.analysis.possibleIssues.push(`${duplicateCheck.length} date/ad combinations have duplicates`);
    }

    if (dateBoundary.filter((r: any) => r.boundary_status !== 'In range').length > 0) {
      results.analysis.possibleIssues.push('Some data falls outside date range');
    }

    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        timestamp: new Date().toISOString(),
        note: 'Compares different aggregation methods to identify data discrepancies',
      },
    });
  } catch (error: unknown) {
    console.error('[DEBUG] Compare aggregations error:', error);
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

export const GET = withAdmin(handleCompareAggregations);
