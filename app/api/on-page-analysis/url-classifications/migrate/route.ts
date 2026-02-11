import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { unstable_rethrow } from 'next/navigation';

/**
 * POST /api/on-page-analysis/url-classifications/migrate
 * Migrations for app_url_classifications table
 */
export async function POST(): Promise<NextResponse> {
  try {
    // v1: Create table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_url_classifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url_path TEXT UNIQUE NOT NULL,
        product_id UUID REFERENCES app_products(id),
        country_code VARCHAR(2) CHECK (country_code IN ('NO', 'SE', 'DK', 'FI')),
        classified_by UUID REFERENCES app_users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_url_classifications_product
      ON app_url_classifications(product_id);
    `);

    // v2: Add is_ignored column for URLs that should be excluded
    await executeQuery(`
      ALTER TABLE app_url_classifications
      ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN NOT NULL DEFAULT false;
    `);

    // Make product_id/country_code nullable (needed for ignored URLs)
    await executeQuery(`ALTER TABLE app_url_classifications ALTER COLUMN product_id DROP NOT NULL;`).catch(() => {});
    await executeQuery(`ALTER TABLE app_url_classifications ALTER COLUMN country_code DROP NOT NULL;`).catch(() => {});

    // v3: Expand country_code CHECK to include FI (Finland)
    await executeQuery(`
      ALTER TABLE app_url_classifications
      DROP CONSTRAINT IF EXISTS app_url_classifications_country_code_check;
    `).catch(() => {});
    await executeQuery(`
      ALTER TABLE app_url_classifications
      ADD CONSTRAINT app_url_classifications_country_code_check
      CHECK (country_code IN ('NO', 'SE', 'DK', 'FI'));
    `).catch(() => {});

    return NextResponse.json({ success: true, message: 'Migration completed' });
  } catch (error) {
    unstable_rethrow(error);
    console.error('URL classifications migration failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 }
    );
  }
}
