import { NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';
import { unstable_rethrow } from 'next/navigation';

export async function POST(request: Request) {
  try {
    const { date, campaignId } = await request.json();

    // Query 2A: Primary subscriptions ONLY (exclude upsells) with product breakdown
    const query = `
      SELECT
        sr.source,
        s.tracking_id_4 as campaign_id,
        s.tracking_id_2 as adset_id,
        s.tracking_id as ad_id,
        DATE(s.date_create) as date,
        p.product_name,
        COUNT(DISTINCT s.id) as subscription_count,
        COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) as approved_count
      FROM subscription s
      INNER JOIN invoice i ON i.subscription_id = s.id
        AND i.type = 1
        AND i.deleted = 0
      LEFT JOIN source sr ON sr.id = s.source_id
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      WHERE s.date_create BETWEEN ? AND ?
        AND s.tracking_id_4 = ?
        AND s.deleted = 0
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      GROUP BY sr.source, s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create), p.product_name
      ORDER BY p.product_name, sr.source
    `;

    const startDate = `${date} 00:00:00`;
    const endDate = `${date} 23:59:59`;

    const data = await executeMariaDBQuery(query, [startDate, endDate, campaignId]);

    return NextResponse.json({
      success: true,
      data,
      count: data.length
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('MariaDB verification query error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
