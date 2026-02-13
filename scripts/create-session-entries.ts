/**
 * Creates and populates the session_entries materialized view.
 *
 * This is a one-time migration script. For subsequent refreshes,
 * use: npx tsx scripts/refresh-session-entries.ts
 *
 * Usage: npx tsx scripts/create-session-entries.ts
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createSessionEntries(): Promise<void> {
  try {
    // Check if it already exists
    const exists = await pool.query(`
      SELECT 1 FROM pg_matviews
      WHERE schemaname = 'remote_session_tracker'
        AND matviewname = 'session_entries'
    `);

    if (exists.rows.length > 0) {
      console.log('session_entries already exists. Dropping and recreating...');
      await pool.query('DROP MATERIALIZED VIEW IF EXISTS remote_session_tracker.session_entries');
    }

    // Create the materialized view
    console.log('Creating session_entries materialized view...');
    const startTime = Date.now();

    await pool.query(`
      CREATE MATERIALIZED VIEW remote_session_tracker.session_entries AS
      WITH ordered_views AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY session_id
            ORDER BY created_at ASC, id ASC
          ) AS page_seq
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE session_id IS NOT NULL
      )
      SELECT
        session_id,
        -- Pick visitor ID from the first page view (not in GROUP BY to avoid
        -- splitting sessions where fingerprint changes mid-session)
        MAX(ff_visitor_id) FILTER (WHERE page_seq = 1) AS ff_visitor_id,

        REGEXP_REPLACE(
          MAX(url_path) FILTER (WHERE page_seq = 1),
          '^https?://', ''
        ) AS entry_url_path,
        MAX(url_full)     FILTER (WHERE page_seq = 1) AS entry_url_full,
        MAX(page_type)    FILTER (WHERE page_seq = 1) AS entry_page_type,
        MIN(created_at)   AS session_start,
        MAX(created_at)   AS session_end,

        MAX(utm_source)   FILTER (WHERE page_seq = 1) AS entry_utm_source,
        MAX(utm_campaign) FILTER (WHERE page_seq = 1) AS entry_utm_campaign,
        MAX(utm_content)  FILTER (WHERE page_seq = 1) AS entry_utm_content,
        MAX(utm_medium)   FILTER (WHERE page_seq = 1) AS entry_utm_medium,
        MAX(utm_term)     FILTER (WHERE page_seq = 1) AS entry_utm_term,
        MAX(keyword)      FILTER (WHERE page_seq = 1) AS entry_keyword,
        MAX(placement)    FILTER (WHERE page_seq = 1) AS entry_placement,
        MAX(referrer)     FILTER (WHERE page_seq = 1) AS entry_referrer,

        MAX(country_code) FILTER (WHERE page_seq = 1) AS entry_country_code,
        MAX(device_type)  FILTER (WHERE page_seq = 1) AS entry_device_type,
        MAX(os_name)      FILTER (WHERE page_seq = 1) AS entry_os_name,
        MAX(browser_name) FILTER (WHERE page_seq = 1) AS entry_browser_name,
        MAX(visit_number) FILTER (WHERE page_seq = 1) AS visit_number,
        MAX(ff_funnel_id) FILTER (WHERE page_seq = 1) AS ff_funnel_id,

        MAX(active_time_s)              FILTER (WHERE page_seq = 1) AS entry_active_time_s,
        MAX(scroll_percent)             FILTER (WHERE page_seq = 1) AS entry_scroll_percent,
        BOOL_OR(hero_scroll_passed)     FILTER (WHERE page_seq = 1) AS entry_hero_scroll_passed,
        BOOL_OR(form_view)              FILTER (WHERE page_seq = 1) AS entry_form_view,
        BOOL_OR(form_started)           FILTER (WHERE page_seq = 1) AS entry_form_started,
        BOOL_OR(cta_viewed)             FILTER (WHERE page_seq = 1) AS entry_cta_viewed,
        BOOL_OR(cta_clicked)            FILTER (WHERE page_seq = 1) AS entry_cta_clicked,

        COUNT(*)                     AS total_page_views,
        COUNT(DISTINCT url_path)     AS unique_pages_visited,
        SUM(active_time_s)           AS total_active_time_s,

        BOOL_OR(page_type = 'pdp' OR page_type = 'pdp-order-form') AS reached_pdp,
        BOOL_OR(page_type = 'order-page' OR (page_type IS NULL AND url_path LIKE '%/order/%')) AS reached_order,
        BOOL_OR(page_type = 'xsell') AS reached_xsell,
        BOOL_OR(page_type = 'thank-you' OR (page_type IS NULL AND url_path LIKE '%/thankyou/%')) AS reached_thankyou

      FROM ordered_views
      GROUP BY session_id
    `);

    const createDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`View created in ${createDuration}s`);

    // Create indexes
    console.log('Creating indexes...');
    const indexStart = Date.now();
    await pool.query(`CREATE INDEX idx_se_entry_url     ON remote_session_tracker.session_entries (entry_url_path)`);
    await pool.query(`CREATE INDEX idx_se_session_start ON remote_session_tracker.session_entries (session_start)`);
    await pool.query(`CREATE INDEX idx_se_visitor       ON remote_session_tracker.session_entries (ff_visitor_id)`);
    await pool.query(`CREATE INDEX idx_se_utm_source    ON remote_session_tracker.session_entries (entry_utm_source, session_start)`);
    await pool.query(`CREATE INDEX idx_se_country       ON remote_session_tracker.session_entries (entry_country_code, session_start)`);
    await pool.query(`CREATE INDEX idx_se_device        ON remote_session_tracker.session_entries (entry_device_type, session_start)`);
    await pool.query(`CREATE INDEX idx_se_page_type     ON remote_session_tracker.session_entries (entry_page_type, session_start)`);
    const indexDuration = ((Date.now() - indexStart) / 1000).toFixed(2);
    console.log(`Indexes created in ${indexDuration}s`);

    // Verify
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_sessions,
        COUNT(DISTINCT ff_visitor_id) as unique_visitors,
        ROUND(AVG(total_page_views), 2) as avg_pages,
        SUM(CASE WHEN total_page_views = 1 THEN 1 ELSE 0 END) as bounces,
        SUM(reached_pdp::int) as pdp,
        SUM(reached_order::int) as orders,
        SUM(reached_xsell::int) as xsell,
        SUM(reached_thankyou::int) as thankyous,
        MIN(session_start)::date as earliest,
        MAX(session_start)::date as latest
      FROM remote_session_tracker.session_entries
    `);

    const s = stats.rows[0];
    console.log(`\nVerification:`);
    console.log(`  Sessions:      ${s.total_sessions}`);
    console.log(`  Visitors:      ${s.unique_visitors}`);
    console.log(`  Avg pages:     ${s.avg_pages}`);
    console.log(`  Bounces:       ${s.bounces}`);
    console.log(`  Reached PDP:   ${s.pdp}`);
    console.log(`  Reached Order: ${s.orders}`);
    console.log(`  Reached Xsell: ${s.xsell}`);
    console.log(`  Reached TY:    ${s.thankyous}`);
    console.log(`  Date range:    ${s.earliest} to ${s.latest}`);

    // Show top 5 entry pages
    const top = await pool.query(`
      SELECT
        entry_url_path,
        COUNT(*) as sessions,
        ROUND(100.0 * SUM(reached_thankyou::int) / COUNT(*), 1) as ty_pct,
        ROUND(AVG(total_page_views), 1) as avg_pages
      FROM remote_session_tracker.session_entries
      GROUP BY entry_url_path
      ORDER BY sessions DESC
      LIMIT 5
    `);
    console.log('\nTop 5 entry pages:');
    console.table(top.rows);

    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createSessionEntries();
