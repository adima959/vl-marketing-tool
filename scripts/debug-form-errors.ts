/**
 * Debug form_errors_detail issue by inspecting raw forms_properties JSONB
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

// Load environment
config({ path: '.env.local' });

const sessionTrackerUrl = process.env.DATABASE_URL_SESSION;
const neonDbUrl = process.env.DATABASE_URL;

if (!sessionTrackerUrl || !neonDbUrl) {
  process.stderr.write('❌ DATABASE_URL_SESSION and DATABASE_URL environment variables are required\n');
  process.exit(1);
}

async function debugFormErrors() {
  const sessionPool = new Pool({ connectionString: sessionTrackerUrl });
  const neonPool = new Pool({ connectionString: neonDbUrl });

  try {
    process.stdout.write('🔍 Debugging form_errors_detail issue\n\n');

    // Step 1: Test connectivity
    process.stdout.write('📋 Step 1: Testing database connectivity...\n');
    await sessionPool.query('SELECT 1');
    process.stdout.write('   ✅ Session tracker connected\n');
    await neonPool.query('SELECT 1');
    process.stdout.write('   ✅ NeonDB connected\n\n');

    // Step 2: Check raw forms_properties structure from source
    process.stdout.write('📋 Step 2: Inspecting raw forms_properties JSONB structure...\n');
    const rawSample = await sessionPool.query(`
      SELECT
        id,
        created_at::date as date,
        jsonb_pretty(forms_properties) as forms_json
      FROM public.event_page_view
      WHERE forms_properties IS NOT NULL
        AND jsonb_typeof(forms_properties) = 'object'
      ORDER BY created_at DESC
      LIMIT 3
    `);

    if (rawSample.rows.length === 0) {
      process.stdout.write('   ⚠️  No rows with forms_properties found\n\n');
    } else {
      process.stdout.write(`   Found ${rawSample.rows.length} samples:\n\n`);
      rawSample.rows.forEach((row, i) => {
        process.stdout.write(`   === Sample ${i + 1} (ID: ${row.id}, Date: ${row.date}) ===\n`);
        process.stdout.write(`${row.forms_json}\n\n`);
      });
    }

    // Step 3: Check current view logic on source
    process.stdout.write('📋 Step 3: Testing current aggregation logic on source...\n');
    const viewTest = await sessionPool.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(CASE WHEN form_errors > 0 THEN 1 END) as rows_with_errors,
        COUNT(CASE WHEN form_errors_detail IS NOT NULL THEN 1 END) as rows_with_details
      FROM public.event_page_view_enriched
    `);

    const vt = viewTest.rows[0];
    process.stdout.write(`   Total rows: ${vt.total_rows}\n`);
    process.stdout.write(`   Rows with errors: ${vt.rows_with_errors}\n`);
    process.stdout.write(`   Rows with error details: ${vt.rows_with_details}\n\n`);

    // Step 4: Show sample with form_errors > 0 from source
    process.stdout.write('📋 Step 4: Sample rows with form_errors > 0 from source view...\n');
    const errorSample = await sessionPool.query(`
      SELECT
        id,
        created_at::date as date,
        form_errors,
        form_errors_detail,
        jsonb_pretty(form_errors_detail) as error_detail_pretty
      FROM public.event_page_view_enriched
      WHERE form_errors > 0
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (errorSample.rows.length === 0) {
      process.stdout.write('   ℹ️  No rows with form_errors > 0\n\n');
    } else {
      errorSample.rows.forEach((row, i) => {
        process.stdout.write(`   ${i + 1}. ID: ${row.id} | Date: ${row.date} | Errors: ${row.form_errors}\n`);
        process.stdout.write(`      Detail NULL: ${row.form_errors_detail === null}\n`);
        if (row.error_detail_pretty) {
          process.stdout.write(`      Detail:\n${row.error_detail_pretty}\n`);
        }
      });
    }

    process.stdout.write('\n✅ Debug complete!\n');

    await sessionPool.end();
    await neonPool.end();

  } catch (error) {
    process.stderr.write('\n❌ Debug failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    if (error instanceof Error && error.stack) {
      process.stderr.write('Stack: ' + error.stack + '\n');
    }
    await sessionPool.end();
    await neonPool.end();
    process.exit(1);
  }
}

debugFormErrors();
