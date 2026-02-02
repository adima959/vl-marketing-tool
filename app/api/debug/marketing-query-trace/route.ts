import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withAdmin } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

/**
 * POST /api/debug/marketing-query-trace
 *
 * Debug endpoint to trace through the marketing query logic step-by-step
 * Shows exactly what queries are being executed and what data is returned
 *
 * Body: {
 *   "dateRange": { "start": "2026-01-01", "end": "2026-02-02" },
 *   "dimensions": ["campaign"],
 *   "depth": 0,
 *   "parentFilters": {}
 * }
 */
async function handleMarketingQueryTrace(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { dateRange, dimensions, depth, parentFilters } = body;

    if (!dateRange || !dimensions || depth === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters: dateRange, dimensions, depth',
        },
        { status: 400 }
      );
    }

    const trace: any[] = [];

    // Dimension mapping (same as in marketingQueryBuilder.ts)
    const dimensionMap: Record<string, string> = {
      network: 'network',
      campaign: 'campaign_name',
      adset: 'adset_name',
      ad: 'ad_name',
      date: 'date',
    };

    const currentDimension = dimensions[depth];
    const sqlColumn = dimensionMap[currentDimension];

    if (!sqlColumn) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown dimension: ${currentDimension}`,
        },
        { status: 400 }
      );
    }

    // Step 1: Build the ads query (same as in marketingQueryBuilder.ts)
    const pgParams: any[] = [
      dateRange.start,
      dateRange.end,
    ];

    // Build parent filters
    let whereClause = '';
    if (parentFilters && Object.keys(parentFilters).length > 0) {
      const conditions: string[] = [];
      Object.entries(parentFilters).forEach(([dimId, value]) => {
        const sqlCol = dimensionMap[dimId];
        if (sqlCol) {
          if (value === 'Unknown') {
            conditions.push(`${sqlCol} IS NULL`);
          } else {
            pgParams.push(value);
            conditions.push(`${sqlCol} = $${pgParams.length}`);
          }
        }
      });
      if (conditions.length > 0) {
        whereClause = `AND ${conditions.join(' AND ')}`;
      }
    }

    const adsQuery = `
      SELECT
        ${sqlColumn} AS dimension_value,
        ROUND(SUM(cost::numeric), 2) AS cost,
        SUM(clicks::integer) AS clicks,
        SUM(impressions::integer) AS impressions,
        ROUND(SUM(conversions::numeric), 0) AS conversions,
        ROUND(SUM(clicks::integer)::numeric / NULLIF(SUM(impressions::integer), 0), 4) AS ctr_percent,
        ROUND(SUM(cost::numeric) / NULLIF(SUM(clicks::integer), 0), 2) AS cpc,
        ROUND(SUM(cost::numeric) / NULLIF(SUM(impressions::integer), 0) * 1000, 2) AS cpm,
        ROUND(SUM(conversions::numeric) / NULLIF(SUM(impressions::integer), 0), 6) AS conversion_rate
      FROM merged_ads_spending
      WHERE date BETWEEN $1 AND $2
        ${whereClause}
      GROUP BY ${sqlColumn}
      ORDER BY clicks DESC
      LIMIT 1000
    `;

    trace.push({
      step: 1,
      description: 'PostgreSQL ads data aggregation query',
      query: adsQuery,
      params: pgParams,
    });

    const adsData = await executeQuery(adsQuery, pgParams) as any[];

    trace.push({
      step: 2,
      description: 'Ads data results',
      rowCount: adsData.length,
      sampleRows: adsData.slice(0, 5),
      totalClicks: adsData.reduce((sum, row) => sum + Number(row.clicks || 0), 0),
      totalImpressions: adsData.reduce((sum, row) => sum + Number(row.impressions || 0), 0),
    });

    // Step 2: Get ID mappings (for CRM matching)
    const idMappingQuery = `
      SELECT DISTINCT
        ${sqlColumn} AS dimension_value,
        campaign_id,
        adset_id,
        ad_id,
        network
      FROM merged_ads_spending
      WHERE date BETWEEN $1 AND $2
        ${whereClause}
    `;

    trace.push({
      step: 3,
      description: 'ID mapping query for CRM matching',
      query: idMappingQuery,
      params: pgParams,
    });

    const idMappings = await executeQuery(idMappingQuery, pgParams) as any[];

    trace.push({
      step: 4,
      description: 'ID mappings results',
      rowCount: idMappings.length,
      sampleMappings: idMappings.slice(0, 10),
    });

    // Step 3: Check if specific campaign exists
    const specificCampaignQuery = `
      SELECT
        campaign_name,
        COUNT(*) as row_count,
        SUM(clicks::integer) as total_clicks,
        SUM(impressions::integer) as total_impressions,
        MIN(date) as min_date,
        MAX(date) as max_date
      FROM merged_ads_spending
      WHERE campaign_name LIKE '%Balansera_Dnk_IM_24_11%'
        AND date BETWEEN $1 AND $2
      GROUP BY campaign_name
    `;

    trace.push({
      step: 5,
      description: 'Check for specific campaign "Balansera_Dnk_IM_24_11"',
      query: specificCampaignQuery,
      params: [dateRange.start, dateRange.end],
    });

    const specificCampaign = await executeQuery(specificCampaignQuery, [dateRange.start, dateRange.end]) as any[];

    trace.push({
      step: 6,
      description: 'Specific campaign results',
      found: specificCampaign.length > 0,
      data: specificCampaign,
    });

    // Step 4: Check for date range issues
    const dateRangeCheckQuery = `
      SELECT
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        COUNT(DISTINCT date) as distinct_dates,
        COUNT(*) as total_rows
      FROM merged_ads_spending
      WHERE campaign_name LIKE '%Balansera_Dnk_IM_24_11%'
    `;

    trace.push({
      step: 7,
      description: 'Date range check for campaign (all dates, no filter)',
      query: dateRangeCheckQuery,
    });

    const dateRangeCheck = await executeQuery(dateRangeCheckQuery, []) as any[];

    trace.push({
      step: 8,
      description: 'Date range check results',
      data: dateRangeCheck[0] || null,
    });

    return NextResponse.json({
      success: true,
      trace,
      summary: {
        dimension: currentDimension,
        sqlColumn,
        dateRange,
        parentFilters,
        adsDataRowCount: adsData.length,
        idMappingsCount: idMappings.length,
        specificCampaignFound: specificCampaign.length > 0,
      },
      meta: {
        timestamp: new Date().toISOString(),
        note: 'This traces the exact queries executed by the marketing dashboard',
      },
    });
  } catch (error: unknown) {
    console.error('[DEBUG] Marketing query trace error:', error);
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

export const POST = withAdmin(handleMarketingQueryTrace);

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/debug/marketing-query-trace',
    methods: ['POST'],
    description: 'Debug endpoint to trace marketing query execution',
    exampleBody: {
      dateRange: { start: '2026-01-01', end: '2026-02-02' },
      dimensions: ['campaign'],
      depth: 0,
      parentFilters: {},
    },
  });
}
