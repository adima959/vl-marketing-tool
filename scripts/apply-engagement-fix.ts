/**
 * Apply engagement fix migration to session_tracker database
 * Fixes: form_errors, active_time_s, scroll_percent, hero_scroll_passed
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment
config({ path: '.env.local' });

// Use SESSION_TRACKER_DATABASE_URL or fall back to DATABASE_URL
const dbUrl = process.env.SESSION_TRACKER_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  process.stderr.write('❌ SESSION_TRACKER_DATABASE_URL or DATABASE_URL environment variable is required\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function applyMigration() {
  try {
    process.stdout.write('🚀 Starting migration: Fix engagement metrics (form_errors, active_time_s, scroll_percent)\n\n');

    // Step 1: Read and execute migration SQL
    process.stdout.write('📋 Step 1: Applying fix migration to session_tracker database...\n');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations/session-tracker-fix-engagement.sql'),
      'utf8'
    );

    // Extract only the forward migration part
    const forwardSQL = migrationSQL.split('-- ROLLBACK INSTRUCTIONS')[0];

    await pool.query(forwardSQL);
    process.stdout.write('   ✅ View updated successfully\n\n');

    // Step 2: Test form_errors fix
    process.stdout.write('📋 Step 2: Testing form_errors fix...\n');
    const formErrorsTest = await pool.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(CASE WHEN form_errors > 0 THEN 1 END) as rows_with_errors,
        SUM(form_errors) as total_errors,
        MAX(form_errors) as max_errors
      FROM public.event_page_view_enriched
    `);

    const fe = formErrorsTest.rows[0];
    process.stdout.write(`   Total rows: ${fe.total_rows}\n`);
    process.stdout.write(`   Rows with form errors: ${fe.rows_with_errors}\n`);
    process.stdout.write(`   Total form errors: ${fe.total_errors}\n`);
    process.stdout.write(`   Max errors per page: ${fe.max_errors}\n`);

    if (fe.rows_with_errors > 0) {
      process.stdout.write('   ✅ Form errors are now being tracked!\n\n');
    } else {
      process.stdout.write('   ℹ️  No form errors found (this may be expected if users haven\'t made errors)\n\n');
    }

    // Step 3: Show sample records with form errors
    process.stdout.write('📋 Step 3: Sample records with form errors...\n');
    const samples = await pool.query(`
      SELECT
        id,
        created_at::date as date,
        LEFT(url_path, 50) as url_path_preview,
        form_errors,
        form_errors_detail,
        form_view,
        form_started
      FROM public.event_page_view_enriched
      WHERE form_errors > 0
      ORDER BY form_errors DESC, created_at DESC
      LIMIT 5
    `);

    if (samples.rows.length === 0) {
      process.stdout.write('   ℹ️  No records with form errors found yet\n');
    } else {
      process.stdout.write(`   Found ${samples.rows.length} records with form errors:\n\n`);
      samples.rows.forEach((r, i) => {
        process.stdout.write(`   ${i + 1}. Errors: ${r.form_errors} | Date: ${r.date}\n`);
        process.stdout.write(`      URL: ${r.url_path_preview}...\n`);
        process.stdout.write(`      Form viewed: ${r.form_view}, started: ${r.form_started}\n`);
        if (r.form_errors_detail && Array.isArray(r.form_errors_detail)) {
          process.stdout.write(`      Error details:\n`);
          r.form_errors_detail.forEach((err: any) => {
            process.stdout.write(`        - ${err.field}: ${err.message}\n`);
          });
        }
      });
    }

    process.stdout.write('\n✅ Engagement fix migration completed successfully!\n');
    process.stdout.write('\n📝 Next step:\n');
    process.stdout.write('   Run: npx tsx scripts/apply-enriched-fields-migration.ts\n');
    process.stdout.write('   This will refresh the materialized view in the main database.\n\n');

    await pool.end();

  } catch (error) {
    process.stderr.write('\n❌ Migration failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    if (error instanceof Error && error.stack) {
      process.stderr.write('Stack: ' + error.stack + '\n');
    }
    process.stderr.write('\n⚠️  Check the error and verify database connection.\n');
    await pool.end();
    process.exit(1);
  }
}

applyMigration();
