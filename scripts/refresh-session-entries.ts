/**
 * Refresh the session_entries materialized view.
 *
 * This view pre-computes one row per session with entry page info,
 * funnel flags, and session-level metrics.
 *
 * Should be run AFTER refreshing event_page_view_enriched_v2.
 *
 * Usage: npx tsx scripts/refresh-session-entries.ts
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function refreshSessionEntries(): Promise<void> {
  try {
    // Check if the view exists
    const exists = await pool.query(`
      SELECT 1 FROM pg_matviews
      WHERE schemaname = 'remote_session_tracker'
        AND matviewname = 'session_entries'
    `);

    if (exists.rows.length === 0) {
      console.error('session_entries materialized view does not exist.');
      console.error('Run the migration first: scripts/migrations/session-entries-view.sql');
      process.exit(1);
    }

    // Refresh
    console.log('Refreshing session_entries materialized view...');
    const startTime = Date.now();
    await pool.query('REFRESH MATERIALIZED VIEW remote_session_tracker.session_entries');
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Refreshed in ${duration}s`);

    // Verify
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_sessions,
        COUNT(DISTINCT ff_visitor_id) as unique_visitors,
        ROUND(AVG(total_page_views), 2) as avg_pages,
        SUM(CASE WHEN total_page_views = 1 THEN 1 ELSE 0 END) as bounces,
        SUM(reached_pdp::int) as pdp,
        SUM(reached_order::int) as orders,
        SUM(reached_thankyou::int) as thankyous,
        MIN(session_start)::date as earliest,
        MAX(session_start)::date as latest
      FROM remote_session_tracker.session_entries
    `);

    const s = stats.rows[0];
    console.log(`\nVerification:`);
    console.log(`  Sessions:    ${s.total_sessions}`);
    console.log(`  Visitors:    ${s.unique_visitors}`);
    console.log(`  Avg pages:   ${s.avg_pages}`);
    console.log(`  Bounces:     ${s.bounces}`);
    console.log(`  Reached PDP: ${s.pdp}`);
    console.log(`  Reached Order: ${s.orders}`);
    console.log(`  Reached TY:  ${s.thankyous}`);
    console.log(`  Date range:  ${s.earliest} to ${s.latest}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

refreshSessionEntries();
