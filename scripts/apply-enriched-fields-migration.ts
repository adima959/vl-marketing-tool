/**
 * Apply the enriched fields migration to recreate the materialized view
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  process.stderr.write('❌ DATABASE_URL environment variable is required\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function applyMigration() {
  try {
    process.stdout.write('🔄 Applying enriched fields migration...\n\n');

    // Read the migration SQL
    const sqlPath = join(process.cwd(), 'scripts/migrations/add-enriched-fields.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    // Extract only the forward migration (before ROLLBACK section)
    const forwardSQL = sql.split('-- ROLLBACK INSTRUCTIONS')[0].trim();

    process.stdout.write('📋 Executing migration SQL...\n');
    const startTime = Date.now();
    await pool.query(forwardSQL);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    process.stdout.write(`   ✅ Migration applied in ${duration}s\n\n`);

    // Verify the materialized view exists
    process.stdout.write('📋 Verifying materialized view...\n');
    const viewCheck = await pool.query(`
      SELECT COUNT(*) as row_count
      FROM remote_session_tracker.event_page_view_enriched_v2
    `);
    process.stdout.write(`   ✅ Materialized view created with ${viewCheck.rows[0].row_count} rows\n\n`);

    // Check keyword and placement data
    const dataCheck = await pool.query(`
      SELECT
        COUNT(CASE WHEN keyword IS NOT NULL AND keyword != '' THEN 1 END) as keyword_count,
        COUNT(CASE WHEN placement IS NOT NULL AND placement != '' THEN 1 END) as placement_count
      FROM remote_session_tracker.event_page_view_enriched_v2
    `);
    process.stdout.write('📊 Data verification:\n');
    process.stdout.write(`   - Keyword populated: ${dataCheck.rows[0].keyword_count} rows\n`);
    process.stdout.write(`   - Placement populated: ${dataCheck.rows[0].placement_count} rows\n\n`);

    process.stdout.write('✅ Migration completed successfully!\n');

    await pool.end();

  } catch (error) {
    process.stderr.write('\n❌ Migration failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

applyMigration();
