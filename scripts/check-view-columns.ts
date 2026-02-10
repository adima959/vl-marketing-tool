/**
 * Check what columns are available in the source view
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sessionTrackerUrl = process.env.DATABASE_URL_SESSION;

if (!sessionTrackerUrl) {
  process.stderr.write('❌ DATABASE_URL_SESSION required\n');
  process.exit(1);
}

async function checkColumns() {
  const pool = new Pool({ connectionString: sessionTrackerUrl });

  try {
    // Get all columns from the view
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'event_page_view_enriched'
      ORDER BY ordinal_position
    `);

    process.stdout.write('Columns in event_page_view_enriched:\n\n');
    result.rows.forEach((row) => {
      process.stdout.write(`  ${row.column_name} (${row.data_type})\n`);
    });

    await pool.end();

  } catch (error) {
    process.stderr.write('❌ Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

checkColumns();
