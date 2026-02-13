import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('=== On-Page Analytics: Today Diagnostic ===\n');

  // 1. Check max date in materialized view
  const mvMax = await pool.query(`
    SELECT
      MAX(created_at) as latest_event,
      MIN(created_at) as earliest_event,
      COUNT(*) as total_rows
    FROM remote_session_tracker.event_page_view_enriched_v2
  `);
  console.log('MATERIALIZED VIEW (event_page_view_enriched_v2):');
  console.log('  Latest event:', mvMax.rows[0].latest_event);
  console.log('  Earliest event:', mvMax.rows[0].earliest_event);
  console.log('  Total rows:', mvMax.rows[0].total_rows);

  // 2. Check today's data in materialized view
  const mvToday = await pool.query(`
    SELECT COUNT(*) as count
    FROM remote_session_tracker.event_page_view_enriched_v2
    WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + interval '1 day'
  `);
  console.log('  Today rows:', mvToday.rows[0].count);

  // 3. Check max date in foreign table
  console.log('\nFOREIGN TABLE (event_page_view_enriched):');
  try {
    const ftMax = await pool.query(`
      SELECT
        MAX(created_at) as latest_event,
        COUNT(*) as total_rows
      FROM remote_session_tracker.event_page_view_enriched
      WHERE created_at >= CURRENT_DATE
    `);
    console.log('  Today rows:', ftMax.rows[0].total_rows);
    console.log('  Latest event:', ftMax.rows[0].latest_event);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('  ERROR querying foreign table:', msg);
  }

  // 4. Check session_entries
  const seMax = await pool.query(`
    SELECT
      MAX(session_start) as latest_session,
      COUNT(*) as total_rows
    FROM remote_session_tracker.session_entries
  `);
  console.log('\nSESSION_ENTRIES:');
  console.log('  Latest session:', seMax.rows[0].latest_session);
  console.log('  Total rows:', seMax.rows[0].total_rows);

  const seToday = await pool.query(`
    SELECT COUNT(*) as count
    FROM remote_session_tracker.session_entries
    WHERE session_start >= CURRENT_DATE AND session_start < CURRENT_DATE + interval '1 day'
  `);
  console.log('  Today rows:', seToday.rows[0].count);

  // 5. Check DB timezone
  const tz = await pool.query(`SELECT current_setting('TIMEZONE') as tz, NOW() as now`);
  console.log('\nDATABASE:');
  console.log('  Timezone:', tz.rows[0].tz);
  console.log('  NOW():', tz.rows[0].now);

  // 6. Last few days breakdown in materialized view
  const daily = await pool.query(`
    SELECT
      created_at::date as day,
      COUNT(*) as page_views,
      COUNT(DISTINCT ff_visitor_id) as visitors
    FROM remote_session_tracker.event_page_view_enriched_v2
    WHERE created_at >= CURRENT_DATE - interval '5 days'
    GROUP BY created_at::date
    ORDER BY day DESC
  `);
  console.log('\nDAILY BREAKDOWN (materialized view, last 5 days):');
  for (const row of daily.rows) {
    console.log(`  ${row.day}: ${row.page_views} views, ${row.visitors} visitors`);
  }

  await pool.end();
}

main().catch(console.error);
