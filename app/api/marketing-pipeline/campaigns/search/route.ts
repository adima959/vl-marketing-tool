import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withPermission } from '@/lib/rbac';
import { handleApiError } from '@/lib/server/apiErrorHandler';
import type { AppUser } from '@/types/user';

interface CampaignSearchRow {
  campaign_id: string;
  campaign_name: string;
  network: string;
  total_spend: string;
  total_clicks: string;
}

/**
 * GET /api/marketing-pipeline/campaigns/search?productId=uuid&geo=NO
 *
 * Returns ad campaigns from merged_ads_spending that are classified
 * for the given product and geography. Used by the CampaignModal
 * to let users pick from real campaigns instead of typing IDs manually.
 */
async function handleGet(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const geo = searchParams.get('geo');

    if (!productId || !geo) {
      return NextResponse.json(
        { success: false, error: 'productId and geo are required' },
        { status: 400 },
      );
    }

    const rows = await executeQuery<CampaignSearchRow>(
      `SELECT
         m.campaign_id,
         MAX(m.campaign_name) AS campaign_name,
         MAX(m.network) AS network,
         ROUND(SUM(m.cost::numeric), 2) AS total_spend,
         SUM(m.clicks::integer) AS total_clicks
       FROM merged_ads_spending m
       JOIN app_campaign_classifications cc
         ON m.campaign_id = cc.campaign_id
         AND cc.is_ignored = false
       WHERE cc.product_id = $1
         AND cc.country_code = $2
         AND m.date::date >= NOW() - INTERVAL '90 days'
       GROUP BY m.campaign_id
       ORDER BY SUM(m.cost::numeric) DESC
       LIMIT 200`,
      [productId, geo],
    );

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        network: r.network || '',
        totalSpend: parseFloat(r.total_spend) || 0,
        totalClicks: parseInt(r.total_clicks, 10) || 0,
      })),
    });
  } catch (error) {
    return handleApiError(error, 'campaign-search:GET');
  }
}

export const GET = withPermission('tools.marketing_pipeline', 'can_view', handleGet);
