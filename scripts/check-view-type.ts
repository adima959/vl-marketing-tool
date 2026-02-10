import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    // Check if it's a regular view
    const viewCheck = await pool.query(`
      SELECT schemaname, viewname
      FROM pg_views
      WHERE schemaname = 'remote_session_tracker'
        AND viewname = 'event_page_view_enriched'
    `);

    // Check if it's a materialized view
    const matviewCheck = await pool.query(`
      SELECT schemaname, matviewname
      FROM pg_matviews
      WHERE schemaname = 'remote_session_tracker'
        AND matviewname = 'event_page_view_enriched'
    `);

    if (viewCheck.rows.length > 0) {
      process.stdout.write('event_page_view_enriched is a REGULAR VIEW\n');
    } else if (matviewCheck.rows.length > 0) {
      process.stdout.write('event_page_view_enriched is a MATERIALIZED VIEW\n');
    } else {
      process.stdout.write('event_page_view_enriched NOT FOUND\n');
    }

    // Also check v2
    const v2Check = await pool.query(`
      SELECT schemaname, matviewname
      FROM pg_matviews
      WHERE schemaname = 'remote_session_tracker'
        AND matviewname = 'event_page_view_enriched_v2'
    `);

    if (v2Check.rows.length > 0) {
      process.stdout.write('event_page_view_enriched_v2 is a MATERIALIZED VIEW\n');
    }

    await pool.end();
  } catch (error) {
    process.stderr.write('Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

check();
