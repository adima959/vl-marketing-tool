import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function find() {
  try {
    // Check all schemas
    const allViews = await pool.query(`
      SELECT schemaname, viewname
      FROM pg_views
      WHERE viewname LIKE '%enriched%'
      ORDER BY schemaname, viewname
    `);

    process.stdout.write('=== Regular Views with "enriched" ===\n');
    allViews.rows.forEach(r => {
      process.stdout.write(`${r.schemaname}.${r.viewname}\n`);
    });

    const allMatviews = await pool.query(`
      SELECT schemaname, matviewname
      FROM pg_matviews
      WHERE matviewname LIKE '%enriched%'
      ORDER BY schemaname, matviewname
    `);

    process.stdout.write('\n=== Materialized Views with "enriched" ===\n');
    allMatviews.rows.forEach(r => {
      process.stdout.write(`${r.schemaname}.${r.matviewname}\n`);
    });

    // Try to query event_page_view_enriched directly
    process.stdout.write('\n=== Testing direct query ===\n');
    try {
      await pool.query('SELECT 1 FROM remote_session_tracker.event_page_view_enriched LIMIT 1');
      process.stdout.write('✅ event_page_view_enriched is queryable\n');
    } catch (e) {
      process.stdout.write('❌ event_page_view_enriched is NOT queryable: ' + (e instanceof Error ? e.message : String(e)) + '\n');
    }

    await pool.end();
  } catch (error) {
    process.stderr.write('Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

find();
