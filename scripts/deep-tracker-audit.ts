import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';

// Load .env.local manually
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
});

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL is required'); process.exit(1); }
const pool = new Pool({ connectionString: DB_URL });

// Parse --hours N for time-scoped runs
const hoursIdx = process.argv.indexOf('--hours');
const HOURS_BACK = hoursIdx !== -1 ? parseInt(process.argv[hoursIdx + 1], 10) : 0;

// queryRunner is either the pool or a dedicated client (for temp view support)
let queryRunner: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> } = pool;

async function q(sql: string, params: unknown[] = []) {
  const result = await queryRunner.query(sql, params);
  return result.rows;
}

function section(title: string) {
  console.log('\n' + '═'.repeat(80));
  console.log('  ' + title);
  console.log('═'.repeat(80));
}

function show(rows: Record<string, unknown>[], label?: string) {
  if (label) console.log('\n-- ' + label + ' --');
  if (rows.length === 0) { console.log('  (no rows)'); return; }
  console.table(rows);
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any = null;
  try {
    // If --hours is set, get a dedicated connection and create temp views
    // that shadow the real tables — all existing queries auto-filter
    if (HOURS_BACK > 0) {
      client = await pool.connect();
      queryRunner = client;
      // Compute cutoff in JS — safe to embed since it's not user input
      const cutoff = new Date(Date.now() - HOURS_BACK * 60 * 60 * 1000).toISOString();
      console.log('\n  Filtering to last ' + HOURS_BACK + ' hour(s) (since ' + cutoff + ')\n');
      // DDL (CREATE VIEW) does not support $1 bind params, so we embed the timestamp directly
      const sessView = 'CREATE TEMP VIEW tracker_sessions AS SELECT * FROM public.tracker_sessions WHERE created_at >= TIMESTAMP ' + "'" + cutoff + "'";
      const pvView = 'CREATE TEMP VIEW tracker_page_views AS SELECT * FROM public.tracker_page_views WHERE viewed_at >= TIMESTAMP ' + "'" + cutoff + "'";
      const evView = 'CREATE TEMP VIEW tracker_events AS SELECT * FROM public.tracker_events WHERE event_at >= TIMESTAMP ' + "'" + cutoff + "'";
      const visView = 'CREATE TEMP VIEW tracker_visitors AS SELECT * FROM public.tracker_visitors WHERE visitor_id IN (SELECT DISTINCT visitor_id FROM pg_temp.tracker_sessions)';
      await client.query(sessView);
      await client.query(pvView);
      await client.query(evView);
      await client.query(visView);
    }

    // ══════════════════════════════════════════════════════════════════
    // SCHEMA DISCOVERY
    // ══════════════════════════════════════════════════════════════════
    section('SCHEMA DISCOVERY');

    const tables = await q(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'tracker_%'
      ORDER BY table_name
    `);
    show(tables, 'Tables matching tracker_%');

    // Get columns for each table
    for (const t of tables) {
      const cols = await q(`
        SELECT column_name, data_type, is_nullable, column_default,
               character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [t.table_name]);
      show(cols, `Columns: ${t.table_name}`);
    }

    // Get views
    const views = await q(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name LIKE 'tracker_%'
      ORDER BY table_name
    `);
    show(views, 'Views matching tracker_%');

    // Get constraints & foreign keys
    const constraints = await q(`
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
             kcu.column_name,
             ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name LIKE 'tracker_%'
      ORDER BY tc.table_name, tc.constraint_type
    `);
    show(constraints, 'Constraints & Foreign Keys');

    // Get indexes
    const indexes = await q(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename LIKE 'tracker_%'
      ORDER BY tablename, indexname
    `);
    show(indexes, 'Indexes');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 1: TABLE SIZES & DATE RANGES
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 1: TABLE SIZES & DATE RANGES');

    show(await q(`
      SELECT 'tracker_sessions' AS tbl, COUNT(*) AS rows FROM tracker_sessions
      UNION ALL SELECT 'tracker_page_views', COUNT(*) FROM tracker_page_views
      UNION ALL SELECT 'tracker_events', COUNT(*) FROM tracker_events
      UNION ALL SELECT 'tracker_visitors', COUNT(*) FROM tracker_visitors
    `), 'Row counts');

    show(await q(`SELECT MIN(created_at) AS earliest, MAX(created_at) AS latest FROM tracker_sessions`), 'Sessions date range');
    show(await q(`SELECT MIN(viewed_at) AS earliest, MAX(viewed_at) AS latest FROM tracker_page_views`), 'Page views date range');
    show(await q(`SELECT MIN(event_at) AS earliest, MAX(event_at) AS latest FROM tracker_events`), 'Events date range');
    show(await q(`SELECT MIN(first_seen_at) AS earliest, MAX(first_seen_at) AS latest FROM tracker_visitors`), 'Visitors date range');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 2: NULL ANALYSIS
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 2: NULL / EMPTY ANALYSIS');

    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(visitor_id) AS has_visitor_id,
        COUNT(ip) AS has_ip,
        COUNT(user_agent) AS has_ua,
        COUNT(timezone) AS has_tz,
        COUNT(language) AS has_lang,
        COUNT(source_click_id) AS has_click_id,
        COUNT(ff_funnel_id) AS has_funnel_id,
        COUNT(utm_source) AS has_utm_src,
        COUNT(utm_campaign) AS has_utm_camp,
        COUNT(utm_medium) AS has_utm_med,
        COUNT(utm_content) AS has_utm_cont,
        COUNT(utm_term) AS has_utm_term,
        COUNT(placement) AS has_placement,
        COUNT(keyword) AS has_keyword,
        COUNT(device_type) AS has_device,
        COUNT(os_name) AS has_os,
        COUNT(browser_name) AS has_browser,
        COUNT(country_code) AS has_country,
        COUNT(entry_page_path) AS has_entry_path,
        COUNT(bot_score) AS has_bot_score
      FROM tracker_sessions
    `), 'Sessions NULL analysis');

    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(session_id) AS has_session_id,
        COUNT(page_type) AS has_page_type,
        COUNT(url_path) AS has_url_path,
        COUNT(url_full) AS has_url_full,
        COUNT(screen_width) AS has_screen_w,
        COUNT(screen_height) AS has_screen_h,
        COUNT(fcp_ms) AS has_fcp,
        COUNT(lcp_ms) AS has_lcp,
        COUNT(tti_ms) AS has_tti,
        COUNT(dcl_ms) AS has_dcl,
        COUNT(load_ms) AS has_load,
        COUNT(performance_metrics) AS has_perf_json,
        COUNT(time_on_page_final_ms) AS has_time_on_page
      FROM tracker_page_views
    `), 'Page views NULL analysis');

    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(event_name) AS has_event_name,
        COUNT(action) AS has_action,
        COUNT(signal_id) AS has_signal_id,
        COUNT(event_properties) AS has_properties
      FROM tracker_events
    `), 'Events NULL analysis');

    // Check for empty strings masquerading as data
    show(await q(`
      SELECT
        COUNT(*) FILTER (WHERE utm_source = '') AS empty_utm_source,
        COUNT(*) FILTER (WHERE utm_campaign = '') AS empty_utm_campaign,
        COUNT(*) FILTER (WHERE utm_medium = '') AS empty_utm_medium,
        COUNT(*) FILTER (WHERE entry_page_path = '') AS empty_entry_path,
        COUNT(*) FILTER (WHERE ip IS NULL) AS null_ip,
        COUNT(*) FILTER (WHERE visitor_id = '') AS empty_visitor_id,
        COUNT(*) FILTER (WHERE device_type = '') AS empty_device,
        COUNT(*) FILTER (WHERE os_name = '') AS empty_os,
        COUNT(*) FILTER (WHERE browser_name = '') AS empty_browser
      FROM tracker_sessions
    `), 'Sessions empty string check');

    show(await q(`
      SELECT
        COUNT(*) FILTER (WHERE url_path = '') AS empty_url_path,
        COUNT(*) FILTER (WHERE url_full = '') AS empty_url_full,
        COUNT(*) FILTER (WHERE page_type = '') AS empty_page_type
      FROM tracker_page_views
    `), 'Page views empty string check');

    show(await q(`
      SELECT
        COUNT(*) FILTER (WHERE event_name = '') AS empty_event_name,
        COUNT(*) FILTER (WHERE action = '') AS empty_action,
        COUNT(*) FILTER (WHERE signal_id = '') AS empty_signal_id
      FROM tracker_events
    `), 'Events empty string check');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 3: CROSS-TABLE ORPHAN DETECTION
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 3: CROSS-TABLE ORPHAN DETECTION');

    show(await q(`
      SELECT COUNT(*) AS orphan_page_views
      FROM tracker_page_views pv
      LEFT JOIN tracker_sessions s ON pv.session_id = s.session_id
      WHERE s.session_id IS NULL
    `), 'Page views → missing sessions');

    show(await q(`
      SELECT COUNT(*) AS sessions_no_page_views
      FROM tracker_sessions s
      LEFT JOIN tracker_page_views pv ON s.session_id = pv.session_id
      WHERE pv.page_view_id IS NULL
    `), 'Sessions with zero page views');

    show(await q(`
      SELECT COUNT(*) AS orphan_events
      FROM tracker_events e
      LEFT JOIN tracker_page_views pv ON e.page_view_id = pv.page_view_id
      WHERE pv.page_view_id IS NULL
    `), 'Events → missing page views');

    show(await q(`
      SELECT COUNT(*) AS sessions_no_visitor
      FROM tracker_sessions s
      LEFT JOIN tracker_visitors v ON s.visitor_id = v.visitor_id
      WHERE v.visitor_id IS NULL
    `), 'Sessions → missing visitors');

    show(await q(`
      SELECT COUNT(*) AS visitors_no_sessions
      FROM tracker_visitors v
      LEFT JOIN tracker_sessions s ON v.visitor_id = s.visitor_id
      WHERE s.session_id IS NULL
    `), 'Visitors with zero sessions');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 4: SESSION ANALYSIS
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 4: SESSION ANALYSIS');

    show(await q(`
      SELECT DATE(created_at) AS day, COUNT(*) AS sessions,
             COUNT(DISTINCT visitor_id) AS unique_visitors
      FROM tracker_sessions
      GROUP BY DATE(created_at) ORDER BY day
    `), 'Sessions per day');

    show(await q(`
      WITH pv_per_sess AS (
        SELECT session_id, COUNT(*) AS pv_count FROM tracker_page_views GROUP BY session_id
      )
      SELECT
        COUNT(*) AS total_sessions,
        MIN(pv_count) AS min_pv,
        ROUND(AVG(pv_count)::numeric, 2) AS avg_pv,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pv_count) AS median_pv,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pv_count) AS p95_pv,
        MAX(pv_count) AS max_pv
      FROM pv_per_sess
    `), 'Page views per session distribution');

    show(await q(`
      SELECT pv.session_id, COUNT(*) AS pv_count,
             MAX(s.device_type) AS device, MAX(s.bot_score) AS bot_score,
             MAX(s.visitor_id) AS visitor_id
      FROM tracker_page_views pv
      JOIN tracker_sessions s ON pv.session_id = s.session_id
      GROUP BY pv.session_id
      HAVING COUNT(*) > 5
      ORDER BY pv_count DESC LIMIT 15
    `), 'Sessions with most page views (>5)');

    show(await q(`
      WITH sess_pv AS (
        SELECT session_id, COUNT(*) AS pv FROM tracker_page_views GROUP BY session_id
      )
      SELECT
        COUNT(*) AS total_sessions,
        COUNT(*) FILTER (WHERE pv = 1) AS bounced,
        ROUND(100.0 * COUNT(*) FILTER (WHERE pv = 1) / NULLIF(COUNT(*), 0), 2) AS bounce_rate
      FROM sess_pv
    `), 'Bounce rate');

    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(bot_score) AS has_score,
        COUNT(*) FILTER (WHERE bot_score > 0.5) AS likely_bots,
        COUNT(*) FILTER (WHERE bot_score > 0.8) AS high_confidence_bots,
        ROUND(AVG(bot_score)::numeric, 4) AS avg_score,
        ROUND(MIN(bot_score)::numeric, 4) AS min_score,
        ROUND(MAX(bot_score)::numeric, 4) AS max_score
      FROM tracker_sessions
    `), 'Bot score distribution');

    show(await q(`
      SELECT
        CASE
          WHEN bot_score IS NULL THEN 'null'
          WHEN bot_score < 0.1 THEN '0-0.1'
          WHEN bot_score < 0.3 THEN '0.1-0.3'
          WHEN bot_score < 0.5 THEN '0.3-0.5'
          WHEN bot_score < 0.8 THEN '0.5-0.8'
          ELSE '0.8-1.0'
        END AS score_bucket,
        COUNT(*) AS sessions
      FROM tracker_sessions
      GROUP BY 1 ORDER BY 1
    `), 'Bot score breakdown');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 5: PAGE VIEW ANALYSIS
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 5: PAGE VIEW ANALYSIS');

    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(fcp_ms) AS has_fcp,
        COUNT(lcp_ms) AS has_lcp,
        COUNT(tti_ms) AS has_tti,
        ROUND(AVG(fcp_ms)::numeric, 0) AS avg_fcp_ms,
        ROUND(AVG(lcp_ms)::numeric, 0) AS avg_lcp_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fcp_ms) AS median_fcp,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lcp_ms) AS median_lcp,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY fcp_ms) AS p95_fcp,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY lcp_ms) AS p95_lcp,
        COUNT(*) FILTER (WHERE fcp_ms < 0) AS fcp_negative,
        COUNT(*) FILTER (WHERE lcp_ms < 0) AS lcp_negative,
        COUNT(*) FILTER (WHERE fcp_ms > 10000) AS fcp_over_10s,
        COUNT(*) FILTER (WHERE lcp_ms > 10000) AS lcp_over_10s,
        MAX(fcp_ms) AS max_fcp,
        MAX(lcp_ms) AS max_lcp
      FROM tracker_page_views
    `), 'Performance metrics distribution');

    show(await q(`
      SELECT COUNT(*) AS fcp_gt_lcp
      FROM tracker_page_views
      WHERE fcp_ms IS NOT NULL AND lcp_ms IS NOT NULL AND fcp_ms > lcp_ms
    `), 'FCP > LCP (should be rare)');

    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(time_on_page_final_ms) AS has_value,
        COUNT(*) FILTER (WHERE time_on_page_final_ms IS NULL) AS null_count,
        COUNT(*) FILTER (WHERE time_on_page_final_ms <= 0) AS zero_or_neg,
        COUNT(*) FILTER (WHERE time_on_page_final_ms > 3600000) AS over_1hr,
        ROUND(AVG(time_on_page_final_ms)::numeric, 0) AS avg_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_on_page_final_ms) AS median_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY time_on_page_final_ms) AS p95_ms,
        MAX(time_on_page_final_ms) AS max_ms
      FROM tracker_page_views
      WHERE time_on_page_final_ms IS NOT NULL
    `), 'time_on_page_final_ms distribution');

    show(await q(`
      SELECT url_path, COUNT(*) AS cnt
      FROM tracker_page_views WHERE url_path IS NOT NULL
      GROUP BY url_path ORDER BY cnt DESC LIMIT 15
    `), 'Top URL paths');

    show(await q(`
      SELECT page_type, COUNT(*) AS cnt
      FROM tracker_page_views GROUP BY page_type ORDER BY cnt DESC
    `), 'Page type distribution');

    show(await q(`
      SELECT session_id, url_path, DATE_TRUNC('second', viewed_at) AS ts, COUNT(*) AS cnt
      FROM tracker_page_views
      GROUP BY session_id, url_path, DATE_TRUNC('second', viewed_at)
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC LIMIT 15
    `), 'Duplicate page views (same session + url + same second)');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 6: EVENT ANALYSIS
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 6: EVENT ANALYSIS');

    show(await q(`
      SELECT event_name, COUNT(*) AS cnt
      FROM tracker_events GROUP BY event_name ORDER BY cnt DESC
    `), 'Event name distribution');

    show(await q(`
      SELECT action, COUNT(*) AS cnt
      FROM tracker_events GROUP BY action ORDER BY cnt DESC LIMIT 10
    `), 'Action distribution');

    show(await q(`
      SELECT signal_id, COUNT(*) AS cnt
      FROM tracker_events WHERE signal_id IS NOT NULL
      GROUP BY signal_id ORDER BY cnt DESC LIMIT 15
    `), 'Signal ID distribution');

    show(await q(`
      SELECT event_name, action, signal_id, COUNT(*) AS cnt
      FROM tracker_events
      GROUP BY event_name, action, signal_id
      ORDER BY cnt DESC LIMIT 20
    `), 'Event name + action + signal combinations');

    show(await q(`
      WITH ev_per_pv AS (
        SELECT page_view_id, COUNT(*) AS ev_count FROM tracker_events GROUP BY page_view_id
      )
      SELECT
        COUNT(*) AS total_page_views,
        ROUND(AVG(ev_count)::numeric, 2) AS avg_events,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ev_count) AS median,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ev_count) AS p95,
        MAX(ev_count) AS max_events
      FROM ev_per_pv
    `), 'Events per page view');

    show(await q(`
      SELECT page_view_id, COUNT(*) AS ev_count
      FROM tracker_events
      GROUP BY page_view_id HAVING COUNT(*) > 50
      ORDER BY ev_count DESC LIMIT 10
    `), 'Page views with excessive events (>50)');

    // event_properties analysis
    show(await q(`
      SELECT event_name, action, event_properties
      FROM tracker_events
      WHERE event_properties IS NOT NULL AND event_properties != '{}'::jsonb
      LIMIT 20
    `), 'Sample non-empty event_properties');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 7: TEMPORAL ANOMALIES
    // (Heartbeat section skipped — raw heartbeats are pruned every minute)
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 7: TEMPORAL ANOMALIES');

    show(await q(`
      SELECT COUNT(*) AS events_before_pageview
      FROM tracker_events e
      JOIN tracker_page_views pv ON e.page_view_id = pv.page_view_id
      WHERE e.event_at < pv.viewed_at - INTERVAL '5 seconds'
    `), 'Events fired >5s before their page view');

    show(await q(`
      SELECT COUNT(*) AS pv_before_session
      FROM tracker_page_views pv
      JOIN tracker_sessions s ON pv.session_id = s.session_id
      WHERE pv.viewed_at < s.created_at - INTERVAL '5 seconds'
    `), 'Page views >5s before session creation');

    show(await q(`
      SELECT EXTRACT(HOUR FROM viewed_at)::int AS hour_utc, COUNT(*) AS page_views
      FROM tracker_page_views
      GROUP BY hour_utc ORDER BY hour_utc
    `), 'Hourly distribution (UTC)');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 8: UTM & TRAFFIC
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 8: UTM & TRAFFIC');

    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(utm_source) AS has_source,
        COUNT(utm_campaign) AS has_campaign,
        COUNT(utm_medium) AS has_medium,
        COUNT(utm_content) AS has_content,
        COUNT(utm_term) AS has_term,
        COUNT(*) FILTER (WHERE utm_source IS NOT NULL AND utm_campaign IS NULL) AS source_no_campaign,
        COUNT(*) FILTER (WHERE utm_campaign IS NOT NULL AND utm_source IS NULL) AS campaign_no_source
      FROM tracker_sessions
    `), 'UTM completeness');

    show(await q(`
      SELECT utm_source, utm_medium, utm_campaign, COUNT(*) AS cnt
      FROM tracker_sessions WHERE utm_source IS NOT NULL
      GROUP BY utm_source, utm_medium, utm_campaign ORDER BY cnt DESC LIMIT 15
    `), 'Top UTM source/medium/campaign combos');

    show(await q(`
      SELECT device_type, COUNT(*) AS cnt,
             ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) AS pct
      FROM tracker_sessions GROUP BY device_type ORDER BY cnt DESC
    `), 'Device type');

    show(await q(`
      SELECT country_code, COUNT(*) AS cnt,
             ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) AS pct
      FROM tracker_sessions GROUP BY country_code ORDER BY cnt DESC LIMIT 10
    `), 'Country');

    show(await q(`
      SELECT os_name, COUNT(*) AS cnt
      FROM tracker_sessions GROUP BY os_name ORDER BY cnt DESC LIMIT 10
    `), 'OS');

    show(await q(`
      SELECT browser_name, COUNT(*) AS cnt
      FROM tracker_sessions GROUP BY browser_name ORDER BY cnt DESC LIMIT 10
    `), 'Browser');

    show(await q(`
      SELECT referrer, COUNT(*) AS cnt
      FROM tracker_sessions WHERE referrer IS NOT NULL AND referrer != ''
      GROUP BY referrer ORDER BY cnt DESC LIMIT 15
    `), 'Top referrers');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 9: VISITOR ANALYSIS
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 9: VISITOR ANALYSIS');

    show(await q(`
      SELECT s.visitor_id, COUNT(*) AS sessions,
             MIN(s.created_at) AS first_session, MAX(s.created_at) AS last_session,
             MAX(s.bot_score) AS max_bot_score
      FROM tracker_sessions s
      GROUP BY s.visitor_id
      ORDER BY sessions DESC LIMIT 15
    `), 'Visitors with most sessions');

    show(await q(`
      WITH sess_per_vis AS (
        SELECT visitor_id, COUNT(*) AS sess_count FROM tracker_sessions GROUP BY visitor_id
      )
      SELECT
        COUNT(*) AS total_visitors,
        COUNT(*) FILTER (WHERE sess_count = 1) AS single_session,
        COUNT(*) FILTER (WHERE sess_count > 1) AS multi_session,
        COUNT(*) FILTER (WHERE sess_count > 5) AS over_5,
        ROUND(AVG(sess_count)::numeric, 2) AS avg_sessions,
        MAX(sess_count) AS max_sessions
      FROM sess_per_vis
    `), 'Sessions per visitor distribution');

    show(await q(`
      WITH actual_first AS (
        SELECT visitor_id, MIN(created_at) AS first_session
        FROM tracker_sessions GROUP BY visitor_id
      )
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (
          WHERE ABS(EXTRACT(EPOCH FROM (v.first_seen_at - af.first_session))) > 60
        ) AS mismatch_over_1min,
        COUNT(*) FILTER (
          WHERE ABS(EXTRACT(EPOCH FROM (v.first_seen_at - af.first_session))) > 3600
        ) AS mismatch_over_1hr,
        COUNT(*) FILTER (
          WHERE v.first_seen_at > af.first_session + INTERVAL '1 minute'
        ) AS first_seen_after_first_session
      FROM tracker_visitors v
      JOIN actual_first af ON v.visitor_id = af.visitor_id
    `), 'Visitor first_seen_at vs actual first session');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 10: DUPLICATE DETECTION
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 10: DUPLICATE DETECTION');

    show(await q(`
      SELECT visitor_id, COUNT(*) AS cnt
      FROM tracker_visitors GROUP BY visitor_id HAVING COUNT(*) > 1
      ORDER BY cnt DESC LIMIT 10
    `), 'Duplicate visitor_ids in tracker_visitors');

    show(await q(`
      SELECT visitor_id, DATE_TRUNC('second', created_at) AS ts, COUNT(*) AS cnt
      FROM tracker_sessions
      GROUP BY visitor_id, DATE_TRUNC('second', created_at)
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC LIMIT 10
    `), 'Duplicate sessions (same visitor + same second)');

    show(await q(`
      SELECT page_view_id, COUNT(*) AS cnt
      FROM tracker_events GROUP BY page_view_id, event_name, action, signal_id,
        DATE_TRUNC('second', event_at)
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC LIMIT 10
    `), 'Duplicate events (same pv + event_name + action + signal + same second)');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 11: DATA CONSISTENCY
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 11: DATA CONSISTENCY');

    // Session entry_page_path vs first page view url_path
    show(await q(`
      WITH first_pv AS (
        SELECT DISTINCT ON (session_id) session_id, url_path
        FROM tracker_page_views
        ORDER BY session_id, viewed_at ASC
      )
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE s.entry_page_path = fp.url_path) AS match,
        COUNT(*) FILTER (WHERE s.entry_page_path != fp.url_path) AS mismatch,
        COUNT(*) FILTER (WHERE s.entry_page_path IS NULL) AS session_null
      FROM tracker_sessions s
      JOIN first_pv fp ON s.session_id = fp.session_id
    `), 'entry_page_path vs first page view url_path');

    // Sample mismatches
    show(await q(`
      WITH first_pv AS (
        SELECT DISTINCT ON (session_id) session_id, url_path
        FROM tracker_page_views
        ORDER BY session_id, viewed_at ASC
      )
      SELECT s.session_id, s.entry_page_path, fp.url_path AS first_pv_path
      FROM tracker_sessions s
      JOIN first_pv fp ON s.session_id = fp.session_id
      WHERE s.entry_page_path IS DISTINCT FROM fp.url_path
      LIMIT 10
    `), 'entry_page_path vs first PV mismatch samples');

    show(await q(`
      SELECT property_dump
      FROM tracker_sessions
      WHERE property_dump IS NOT NULL AND property_dump != '{}'::jsonb
      LIMIT 5
    `), 'property_dump contents sample');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 12: INDEX & TABLE HEALTH
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 12: INDEX & TABLE HEALTH');

    show(await q(`
      SELECT relname, n_live_tup, n_dead_tup,
             CASE WHEN n_live_tup > 0
               THEN ROUND(100.0 * n_dead_tup / n_live_tup, 2)
               ELSE 0 END AS dead_pct,
             last_autovacuum, last_autoanalyze
      FROM pg_stat_user_tables
      WHERE relname LIKE 'tracker_%'
      ORDER BY n_dead_tup DESC
    `), 'Table bloat');

    show(await q(`
      SELECT
        pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
        pg_size_pretty(pg_table_size(c.oid)) AS table_size,
        pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
        c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'tracker_%' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `), 'Table sizes on disk');

    // Check for missing FK constraints
    show(await q(`
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema = 'public' AND tc.table_name LIKE 'tracker_%'
        AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name
    `), 'Foreign key constraints (existing)');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 13: ADVANCED CROSS-TABLE ANALYSIS
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 13: ADVANCED CROSS-TABLE ANALYSIS');

    // Events timeline consistency
    show(await q(`
      SELECT
        COUNT(*) AS total_events,
        COUNT(*) FILTER (WHERE e.event_at > pv.viewed_at + INTERVAL '30 minutes') AS event_30min_after_pv,
        COUNT(*) FILTER (WHERE e.event_at > pv.viewed_at + INTERVAL '1 hour') AS event_1hr_after_pv,
        COUNT(*) FILTER (WHERE e.event_at > s.created_at + INTERVAL '2 hours') AS event_2hr_after_session
      FROM tracker_events e
      JOIN tracker_page_views pv ON e.page_view_id = pv.page_view_id
      JOIN tracker_sessions s ON pv.session_id = s.session_id
    `), 'Events timeline relative to page view & session');

    // Visitor tracker_visitors metadata vs sessions
    show(await q(`
      SELECT
        COUNT(*) AS total_visitors,
        COUNT(v.first_seen_at) AS has_first_seen
      FROM tracker_visitors v
    `), 'Visitor record completeness');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 14: DATA QUALITY EDGE CASES
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 14: DATA QUALITY EDGE CASES');

    // Screen size anomalies
    show(await q(`
      SELECT
        COUNT(*) FILTER (WHERE screen_width = 0 OR screen_height = 0) AS zero_dims,
        COUNT(*) FILTER (WHERE screen_width > 5000 OR screen_height > 5000) AS huge_dims,
        COUNT(*) FILTER (WHERE screen_width < screen_height) AS portrait,
        COUNT(*) FILTER (WHERE screen_width >= screen_height) AS landscape
      FROM tracker_page_views
      WHERE screen_width IS NOT NULL AND screen_height IS NOT NULL
    `), 'Screen size anomalies');

    // IP address analysis
    show(await q(`
      SELECT ip, COUNT(*) AS sessions, COUNT(DISTINCT visitor_id) AS distinct_visitors
      FROM tracker_sessions
      WHERE ip IS NOT NULL
      GROUP BY ip
      ORDER BY sessions DESC LIMIT 10
    `), 'Top IPs by session count');

    // Same IP, different visitors
    show(await q(`
      SELECT ip, COUNT(DISTINCT visitor_id) AS distinct_visitors, COUNT(*) AS sessions
      FROM tracker_sessions
      WHERE ip IS NOT NULL
      GROUP BY ip
      HAVING COUNT(DISTINCT visitor_id) > 3
      ORDER BY distinct_visitors DESC LIMIT 10
    `), 'IPs with many distinct visitors (>3)');

    // Same visitor, different IPs
    show(await q(`
      SELECT visitor_id, COUNT(DISTINCT ip) AS distinct_ips, COUNT(*) AS sessions
      FROM tracker_sessions
      WHERE ip IS NOT NULL
      GROUP BY visitor_id
      HAVING COUNT(DISTINCT ip) > 3
      ORDER BY distinct_ips DESC LIMIT 10
    `), 'Visitors with many distinct IPs (>3)');

    // User agent consistency per visitor
    show(await q(`
      SELECT visitor_id, COUNT(DISTINCT user_agent) AS ua_count, COUNT(*) AS sessions
      FROM tracker_sessions
      GROUP BY visitor_id
      HAVING COUNT(DISTINCT user_agent) > 2
      ORDER BY ua_count DESC LIMIT 10
    `), 'Visitors with many distinct user agents (>2)');

    // ══════════════════════════════════════════════════════════════════
    // PHASE 15: FUNNEL & CLICK ID ANALYSIS
    // ══════════════════════════════════════════════════════════════════
    section('PHASE 15: FUNNEL & CLICK ID ANALYSIS');

    show(await q(`
      SELECT ff_funnel_id, COUNT(*) AS cnt
      FROM tracker_sessions WHERE ff_funnel_id IS NOT NULL
      GROUP BY ff_funnel_id ORDER BY cnt DESC LIMIT 10
    `), 'Top funnel IDs');

    show(await q(`
      SELECT source_click_id, COUNT(*) AS cnt
      FROM tracker_sessions WHERE source_click_id IS NOT NULL
      GROUP BY source_click_id ORDER BY cnt DESC LIMIT 10
    `), 'Top click IDs');

    // Sessions with click_id but no UTM
    show(await q(`
      SELECT
        COUNT(*) AS total_with_click_id,
        COUNT(*) FILTER (WHERE utm_source IS NULL) AS no_utm_source,
        COUNT(*) FILTER (WHERE utm_campaign IS NULL) AS no_utm_campaign
      FROM tracker_sessions
      WHERE source_click_id IS NOT NULL
    `), 'Click ID sessions missing UTM data');

    console.log('\n\n=== DEEP AUDIT COMPLETE ===');
  } catch (error) {
    console.error('Analysis failed:', error);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
