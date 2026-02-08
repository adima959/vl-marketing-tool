import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';

/**
 * POST /api/saved-views/migrate
 * One-time migration to create the app_saved_views table
 */
export async function POST(): Promise<NextResponse> {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS app_saved_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        page_path VARCHAR(255) NOT NULL,
        date_mode VARCHAR(10) NOT NULL CHECK (date_mode IN ('relative', 'absolute')),
        date_preset VARCHAR(30),
        date_start DATE,
        date_end DATE,
        dimensions TEXT[],
        sort_by VARCHAR(100),
        sort_dir VARCHAR(7) CHECK (sort_dir IN ('ascend', 'descend')),
        period VARCHAR(10),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, name, page_path)
      );
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_saved_views_user_page
      ON app_saved_views(user_id, page_path);
    `);

    // Add visible_columns column if it doesn't exist
    await executeQuery(`
      ALTER TABLE app_saved_views
      ADD COLUMN IF NOT EXISTS visible_columns TEXT[];
    `);

    // Add filters column (JSONB array of {field, operator, value} objects)
    await executeQuery(`
      ALTER TABLE app_saved_views
      ADD COLUMN IF NOT EXISTS filters JSONB DEFAULT NULL;
    `);

    // Add favorites columns
    await executeQuery(`
      ALTER TABLE app_saved_views
      ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;
    `);

    await executeQuery(`
      ALTER TABLE app_saved_views
      ADD COLUMN IF NOT EXISTS favorite_order INTEGER DEFAULT NULL;
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_saved_views_favorites
      ON app_saved_views(user_id) WHERE is_favorite = true;
    `);

    return NextResponse.json({ success: true, message: 'Migration completed' });
  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 }
    );
  }
}
