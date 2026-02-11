import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { unstable_rethrow } from 'next/navigation';

interface AdsRow {
  network: string;
  date: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  ad_id: string;
  ad_name: string;
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr_percent: number;
  cpc: number;
  cpm: number;
}

export async function POST(request: Request) {
  try {
    const { date, campaignName } = await request.json();

    // Query 1B: Aggregated ads data for matching with CRM
    const query = `
      SELECT
        network,
        date,
        campaign_id,
        campaign_name,
        adset_id,
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
      WHERE date = $1
        AND campaign_name = $2
        AND network = 'Google Ads'
      ORDER BY ad_id
    `;

    const data = await executeQuery<AdsRow>(query, [date, campaignName]);

    return NextResponse.json({
      success: true,
      data,
      count: data.length
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('PostgreSQL verification query error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
