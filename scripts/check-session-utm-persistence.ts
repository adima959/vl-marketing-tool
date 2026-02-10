import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    // Get sample page views grouped by session to see UTM persistence
    const result = await pool.query(`
      SELECT
        session_id,
        url_path,
        utm_source,
        utm_campaign,
        utm_content,
        utm_medium,
        created_at
      FROM remote_session_tracker.event_page_view_enriched
      WHERE session_id IS NOT NULL
        AND created_at >= NOW() - INTERVAL '7 days'
      ORDER BY session_id, created_at
      LIMIT 30
    `);

    process.stdout.write('=== Sample page views grouped by session ===\n\n');

    let lastSession = null;
    for (const row of result.rows) {
      if (row.session_id !== lastSession) {
        process.stdout.write(`\n--- Session: ${row.session_id} ---\n`);
        lastSession = row.session_id;
      }

      const utms = [row.utm_source, row.utm_campaign, row.utm_content, row.utm_medium]
        .filter(Boolean)
        .join(' | ') || '(no UTMs)';

      const urlPath = (row.url_path || '').substring(0, 35).padEnd(37);
      process.stdout.write(`  ${urlPath} UTMs: ${utms}\n`);
    }

    await pool.end();
  } catch (error) {
    process.stderr.write('Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

check();
