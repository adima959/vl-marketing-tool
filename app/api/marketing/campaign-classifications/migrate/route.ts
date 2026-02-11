import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { unstable_rethrow } from 'next/navigation';

/**
 * POST /api/marketing/campaign-classifications/migrate
 * Migrations for app_campaign_classifications table
 */
export async function POST(): Promise<NextResponse> {
  try {
    // v1: Create table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_campaign_classifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id TEXT UNIQUE NOT NULL,
        product_id UUID REFERENCES app_products(id),
        country_code VARCHAR(2) CHECK (country_code IN ('NO', 'SE', 'DK', 'FI')),
        classified_by UUID REFERENCES app_users(id),
        is_ignored BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_campaign_classifications_product
      ON app_campaign_classifications(product_id);
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_campaign_classifications_campaign
      ON app_campaign_classifications(campaign_id);
    `);

    return NextResponse.json({ success: true, message: 'Migration completed' });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 }
    );
  }
}
