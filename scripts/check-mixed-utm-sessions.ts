import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    // Find sessions where some page views have UTMs and some don't
    const result = await pool.query(`
      SELECT
        session_id,
        COUNT(*) as total_views,
        COUNT(CASE WHEN utm_source IS NULL THEN 1 END) as views_without_utms,
        COUNT(CASE WHEN utm_source IS NOT NULL THEN 1 END) as views_with_utms
      FROM remote_session_tracker.event_page_view_enriched
      WHERE session_id IS NOT NULL
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY session_id
      HAVING COUNT(*) > 1
        AND COUNT(CASE WHEN utm_source IS NULL THEN 1 END) > 0
        AND COUNT(CASE WHEN utm_source IS NOT NULL THEN 1 END) > 0
      LIMIT 5
    `);

    process.stdout.write('=== Sessions with MIXED UTM presence ===\n\n');

    if (result.rows.length === 0) {
      process.stdout.write('No sessions found with mixed UTM presence.\n');
      process.stdout.write('This means UTMs are either ALL present or ALL absent per session.\n');
    } else {
      for (const row of result.rows) {
        process.stdout.write(`Session: ${row.session_id}\n`);
        process.stdout.write(`  Total views: ${row.total_views}\n`);
        process.stdout.write(`  With UTMs: ${row.views_with_utms}\n`);
        process.stdout.write(`  Without UTMs: ${row.views_without_utms}\n\n`);

        // Get details for this session
        const details = await pool.query(`
          SELECT url_path, utm_source, utm_campaign, created_at
          FROM remote_session_tracker.event_page_view_enriched
          WHERE session_id = $1
          ORDER BY created_at
        `, [row.session_id]);

        for (const detail of details.rows) {
          const utms = detail.utm_source || '(no UTMs)';
          process.stdout.write(`    ${detail.url_path?.substring(0, 40).padEnd(42)} ${utms}\n`);
        }
        process.stdout.write('\n');
      }
    }

    await pool.end();
  } catch (error) {
    process.stderr.write('Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

check();
