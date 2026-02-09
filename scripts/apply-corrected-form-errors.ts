/**
 * Apply corrected form_errors_detail migration
 * Uses actual JSONB structure: field_error_count object instead of errors array
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

config({ path: '.env.local' });

const sessionTrackerUrl = process.env.DATABASE_URL_SESSION;
const neonDbUrl = process.env.DATABASE_URL;

if (!sessionTrackerUrl || !neonDbUrl) {
  process.stderr.write('❌ Both DATABASE_URL_SESSION and DATABASE_URL are required\n');
  process.exit(1);
}

async function applyCorrection() {
  const sessionPool = new Pool({ connectionString: sessionTrackerUrl });
  const neonPool = new Pool({ connectionString: neonDbUrl });

  try {
    process.stdout.write('🚀 Applying corrected form_errors_detail migration\n\n');

    // Step 1: Apply corrected view to session_tracker
    process.stdout.write('📋 Step 1: Updating view in session_tracker database...\n');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations/fix-form-errors-detail-only.sql'),
      'utf8'
    );

    // Execute up to the verification section
    const viewSQL = migrationSQL.split('-- VERIFICATION')[0];
    await sessionPool.query(viewSQL);
    process.stdout.write('   ✅ View updated in session_tracker\n\n');

    // Step 2: Test on session_tracker
    process.stdout.write('📋 Step 2: Testing on session_tracker...\n');
    const testResult = await sessionPool.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(CASE WHEN form_errors > 0 THEN 1 END) as rows_with_errors,
        COUNT(CASE WHEN form_errors_detail IS NOT NULL THEN 1 END) as rows_with_details,
        SUM(form_errors) as total_errors
      FROM public.event_page_view_enriched
    `);

    const t = testResult.rows[0];
    process.stdout.write(`   Total rows: ${t.total_rows}\n`);
    process.stdout.write(`   Rows with errors: ${t.rows_with_errors}\n`);
    process.stdout.write(`   Rows with error details: ${t.rows_with_details}\n`);
    process.stdout.write(`   Total errors: ${t.total_errors}\n\n`);

    if (Number(t.rows_with_details) > 0) {
      process.stdout.write('   ✅ Error details are now being captured!\n\n');

      // Show sample
      const sample = await sessionPool.query(`
        SELECT
          id,
          created_at::date as date,
          form_errors,
          jsonb_pretty(form_errors_detail) as details
        FROM public.event_page_view_enriched
        WHERE form_errors_detail IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 3
      `);

      process.stdout.write('   Sample records:\n');
      sample.rows.forEach((r, i) => {
        process.stdout.write(`   ${i + 1}. Errors: ${r.form_errors} | Date: ${r.date}\n`);
        process.stdout.write(`${r.details}\n\n`);
      });
    } else {
      process.stdout.write('   ⚠️  Still no error details found\n\n');
    }

    // Step 3: Refresh foreign table in neondb
    process.stdout.write('📋 Step 3: Refreshing foreign table in neondb...\n');
    await neonPool.query(`
      DROP FOREIGN TABLE IF EXISTS remote_session_tracker.event_page_view_enriched CASCADE;
    `);
    process.stdout.write('   ✅ Dropped old foreign table\n');

    await neonPool.query(`
      IMPORT FOREIGN SCHEMA public
      LIMIT TO (event_page_view_enriched)
      FROM SERVER remote_session_tracker
      INTO remote_session_tracker;
    `);
    process.stdout.write('   ✅ Imported fresh foreign table schema\n\n');

    // Step 4: Recreate materialized view
    process.stdout.write('📋 Step 4: Recreating materialized view in neondb...\n');
    const matViewSQL = fs.readFileSync(
      path.join(__dirname, 'migrations/normalize-url-path-view.sql'),
      'utf8'
    );

    // Extract only the CREATE and REFRESH parts
    const createSQL = matViewSQL.split('-- VERIFICATION QUERIES')[0];
    await neonPool.query(createSQL);
    process.stdout.write('   ✅ Materialized view recreated and refreshed\n\n');

    // Step 5: Verify in neondb
    process.stdout.write('📋 Step 5: Verifying in neondb...\n');
    const verifyResult = await neonPool.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(CASE WHEN form_errors > 0 THEN 1 END) as rows_with_errors,
        COUNT(CASE WHEN form_errors_detail IS NOT NULL THEN 1 END) as rows_with_details
      FROM remote_session_tracker.event_page_view_enriched_v2
    `);

    const v = verifyResult.rows[0];
    process.stdout.write(`   Total rows: ${v.total_rows}\n`);
    process.stdout.write(`   Rows with errors: ${v.rows_with_errors}\n`);
    process.stdout.write(`   Rows with error details: ${v.rows_with_details}\n\n`);

    if (Number(v.rows_with_details) === Number(v.rows_with_errors)) {
      process.stdout.write('   ✅ SUCCESS! All error rows now have details!\n\n');
    } else {
      process.stdout.write('   ⚠️  Mismatch between error count and detail count\n\n');
    }

    process.stdout.write('✅ Migration complete!\n');
    process.stdout.write('\n📝 Next: Export data again to verify form_errors_detail appears in CSV\n\n');

    await sessionPool.end();
    await neonPool.end();

  } catch (error) {
    process.stderr.write('\n❌ Failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    if (error instanceof Error && error.stack) {
      process.stderr.write('Stack: ' + error.stack + '\n');
    }
    await sessionPool.end();
    await neonPool.end();
    process.exit(1);
  }
}

applyCorrection();
