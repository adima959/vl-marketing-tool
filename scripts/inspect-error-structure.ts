/**
 * Find records with actual form errors to inspect the JSONB structure
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sessionTrackerUrl = process.env.DATABASE_URL_SESSION;

if (!sessionTrackerUrl) {
  process.stderr.write('❌ DATABASE_URL_SESSION required\n');
  process.exit(1);
}

async function inspectErrors() {
  const pool = new Pool({ connectionString: sessionTrackerUrl });

  try {
    process.stdout.write('🔍 Finding records with actual form errors...\n\n');

    // Find records where at least one form has error_count > 0
    const errorRecords = await pool.query(`
      SELECT
        epv.id,
        epv.created_at::date as date,
        jsonb_pretty(epv.forms_properties) as forms_json
      FROM public.event_page_view epv
      CROSS JOIN LATERAL jsonb_each(epv.forms_properties) AS f(key, value)
      WHERE (f.value ->> 'error_count')::integer > 0
      ORDER BY epv.created_at DESC
      LIMIT 5
    `);

    if (errorRecords.rows.length === 0) {
      process.stdout.write('❌ No records found with error_count > 0\n');
      process.stdout.write('   This explains why form_errors_detail is always NULL.\n');
      process.stdout.write('   The errors array likely doesn\'t exist in the JSONB structure.\n\n');
    } else {
      process.stdout.write(`✅ Found ${errorRecords.rows.length} records with errors:\n\n`);
      errorRecords.rows.forEach((row, i) => {
        process.stdout.write(`=== Record ${i + 1} (ID: ${row.id}, Date: ${row.date}) ===\n`);
        process.stdout.write(`${row.forms_json}\n\n`);
      });
    }

    await pool.end();

  } catch (error) {
    process.stderr.write('❌ Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    if (error instanceof Error && error.stack) {
      process.stderr.write(error.stack + '\n');
    }
    await pool.end();
    process.exit(1);
  }
}

inspectErrors();
