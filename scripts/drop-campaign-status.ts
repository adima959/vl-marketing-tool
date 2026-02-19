import { config } from 'dotenv';
import { resolve } from 'path';
import { executeQuery } from '@/lib/server/db';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  console.log('Dropping campaign status column...\n');

  try {
    // Check if column exists before dropping
    const check = await executeQuery<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'app_pipeline_campaigns'
          AND column_name = 'status'
      ) as exists
    `);

    if (check[0]?.exists) {
      console.log('✓ Found status column, dropping...');

      // Drop the status column
      await executeQuery(`
        ALTER TABLE app_pipeline_campaigns DROP COLUMN status
      `);

      console.log('✓ Column "status" dropped from app_pipeline_campaigns');
    } else {
      console.log('ℹ Column "status" does not exist in app_pipeline_campaigns (already dropped)');
    }

    // Drop the index on status if it exists
    await executeQuery(`
      DROP INDEX IF EXISTS idx_pl_campaigns_status
    `);

    console.log('✓ Index idx_pl_campaigns_status dropped (if existed)');

    console.log('\n✅ Migration complete!');
    console.log('\nNote: app_campaign_status enum type still exists but is unused.');
    console.log('Enum types cannot be easily dropped if they have dependencies.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

main().catch(console.error).finally(() => process.exit(0));
