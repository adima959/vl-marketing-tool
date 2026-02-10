/**
 * Get current view definition to see the actual structure
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sessionTrackerUrl = process.env.DATABASE_URL_SESSION;

if (!sessionTrackerUrl) {
  process.stderr.write('❌ DATABASE_URL_SESSION required\n');
  process.exit(1);
}

async function getViewDef() {
  const pool = new Pool({ connectionString: sessionTrackerUrl });

  try {
    const result = await pool.query(`
      SELECT pg_get_viewdef('public.event_page_view_enriched'::regclass, true) as view_definition
    `);

    process.stdout.write('Current view definition:\n\n');
    process.stdout.write(result.rows[0].view_definition);
    process.stdout.write('\n');

    await pool.end();

  } catch (error) {
    process.stderr.write('❌ Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

getViewDef();
