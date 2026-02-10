/**
 * Fix materialized view to include all missing columns
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

config({ path: '.env.local' });

const neonDbUrl = process.env.DATABASE_URL;

if (!neonDbUrl) {
  process.stderr.write('❌ DATABASE_URL required\n');
  process.exit(1);
}

async function fixMaterializedView() {
  const pool = new Pool({ connectionString: neonDbUrl });

  try {
    process.stdout.write('🚀 Fixing materialized view to include all columns\n\n');

    // Read and execute the fix migration
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations/fix-materialized-view-columns.sql'),
      'utf8'
    );

    const sqlStatements = migrationSQL.split('-- Verification')[0];

    process.stdout.write('📋 Dropping and recreating materialized view...\n');
    await pool.query(sqlStatements);
    process.stdout.write('   ✅ Materialized view recreated with all columns\n\n');

    // Verify
    process.stdout.write('📋 Verifying columns and data...\n');
    const verifyResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(session_id) as has_session_id,
        COUNT(CASE WHEN cta_viewed THEN 1 END) as cta_viewed_count,
        COUNT(CASE WHEN cta_clicked THEN 1 END) as cta_clicked_count,
        COUNT(CASE WHEN form_errors > 0 THEN 1 END) as rows_with_errors,
        COUNT(CASE WHEN form_errors_detail IS NOT NULL THEN 1 END) as rows_with_details
      FROM remote_session_tracker.event_page_view_enriched_v2
    `);

    const v = verifyResult.rows[0];
    process.stdout.write(`   Total rows: ${v.total}\n`);
    process.stdout.write(`   Rows with session_id: ${v.has_session_id}\n`);
    process.stdout.write(`   CTA viewed count: ${v.cta_viewed_count}\n`);
    process.stdout.write(`   CTA clicked count: ${v.cta_clicked_count}\n`);
    process.stdout.write(`   Form errors: ${v.rows_with_errors}\n`);
    process.stdout.write(`   Form error details: ${v.rows_with_details}\n\n`);

    process.stdout.write('✅ Materialized view fixed!\n');
    process.stdout.write('\n📝 The API should now work correctly.\n\n');

    await pool.end();

  } catch (error) {
    process.stderr.write('\n❌ Failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    if (error instanceof Error && error.stack) {
      process.stderr.write('Stack: ' + error.stack + '\n');
    }
    await pool.end();
    process.exit(1);
  }
}

fixMaterializedView();
