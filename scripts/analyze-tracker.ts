import { Pool } from '@neondatabase/serverless';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

async function q(sql: string, params: unknown[] = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

function section(title: string) {
  console.log('\n' + '='.repeat(80));
  console.log('  ' + title);
  console.log('='.repeat(80));
}

function show(rows: Record<string, unknown>[]) {
  if (rows.length === 0) { console.log('  (no rows)'); return; }
  console.table(rows);
}

async function main() {
  try {
    // ════════════════════════════════════════════════════════════════
    // PHASE 1: DATE RANGES
    // ════════════════════════════════════════════════════════════════
    section('PHASE 1: DATE RANGES');

    console.log('\n-- tracker_sessions --');
    show(await q('SELECT MIN(created_at) AS earliest, MAX(created_at) AS latest FROM tracker_sessions'));

    console.log('\n-- tracker_page_views --');
    show(await q('SELECT MIN(viewed_at) AS earliest, MAX(viewed_at) AS latest FROM tracker_page_views'));

    console.log('\n-- tracker_events --');
    show(await q('SELECT MIN(event_at) AS earliest, MAX(event_at) AS latest FROM tracker_events'));

    console.log('\n-- tracker_raw_heartbeats --');
    show(await q('SELECT MIN(cumulative_heartbeat_at) AS earliest, MAX(cumulative_heartbeat_at) AS latest FROM tracker_raw_heartbeats'));

    console.log('\n-- tracker_visitors --');
    show(await q('SELECT MIN(first_seen_at) AS earliest, MAX(first_seen_at) AS latest FROM tracker_visitors'));

    // ════════════════════════════════════════════════════════════════
    // PHASE 2: NULL ANALYSIS
    // ════════════════════════════════════════════════════════════════
    section('PHASE 2: NULL ANALYSIS');

    console.log('\n-- 2a. tracker_sessions nulls --');
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
        COUNT(refferer) AS has_referrer,
        COUNT(device_type) AS has_device,
        COUNT(os_name) AS has_os,
        COUNT(browser_name) AS has_browser,
        COUNT(country_code) AS has_country,
        COUNT(entry_page_path) AS has_entry_path,
        COUNT(cumulative_time_s) AS has_cum_time,
        COUNT(bot_score) AS has_bot_score
      FROM tracker_sessions
    `));

    console.log('\n-- 2b. tracker_page_views nulls --');
    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(session_id) AS has_session_id,
        COUNT(page_type) AS has_page_type,
        COUNT(url_path) AS has_url_path,
        COUNT(url_full) AS has_url_full,
        COUNT(referrer_url) AS has_referrer,
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
    `));

    console.log('\n-- 2c. tracker_events nulls --');
    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(event_name) AS has_event_name,
        COUNT(action) AS has_action,
        COUNT(signal_id) AS has_signal_id,
        COUNT(event_properties) AS has_properties
      FROM tracker_events
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 3: CROSS-TABLE ORPHAN DETECTION
    // ════════════════════════════════════════════════════════════════
    section('PHASE 3: CROSS-TABLE ORPHAN DETECTION');

    console.log('\n-- 3a. Page views referencing non-existent sessions --');
    show(await q(`
      SELECT COUNT(*) AS orphan_page_views
      FROM tracker_page_views pv
      LEFT JOIN tracker_sessions s ON pv.session_id = s.session_id
      WHERE s.session_id IS NULL
    `));

    console.log('\n-- 3b. Sessions with zero page views --');
    show(await q(`
      SELECT COUNT(*) AS sessions_no_page_views
      FROM tracker_sessions s
      LEFT JOIN tracker_page_views pv ON s.session_id = pv.session_id
      WHERE pv.page_view_id IS NULL
    `));

    console.log('\n-- 3c. Events referencing non-existent page views --');
    show(await q(`
      SELECT COUNT(*) AS orphan_events
      FROM tracker_events e
      LEFT JOIN tracker_page_views pv ON e.page_view_id = pv.page_view_id
      WHERE pv.page_view_id IS NULL
    `));

    console.log('\n-- 3d. Heartbeats referencing non-existent page views --');
    show(await q(`
      SELECT COUNT(*) AS orphan_heartbeats
      FROM tracker_raw_heartbeats hb
      LEFT JOIN tracker_page_views pv ON hb.page_view_id = pv.page_view_id
      WHERE pv.page_view_id IS NULL
    `));

    console.log('\n-- 3e. Heartbeats referencing non-existent sessions --');
    show(await q(`
      SELECT COUNT(*) AS orphan_heartbeats_session
      FROM tracker_raw_heartbeats hb
      LEFT JOIN tracker_sessions s ON hb.session_id = s.session_id
      WHERE s.session_id IS NULL
    `));

    console.log('\n-- 3f. Sessions referencing non-existent visitors --');
    show(await q(`
      SELECT COUNT(*) AS sessions_no_visitor
      FROM tracker_sessions s
      LEFT JOIN tracker_visitors v ON s.visitor_id = v.visitor_id
      WHERE v.visitor_id IS NULL
    `));

    console.log('\n-- 3g. Visitors with zero sessions --');
    show(await q(`
      SELECT COUNT(*) AS visitors_no_sessions
      FROM tracker_visitors v
      LEFT JOIN tracker_sessions s ON v.visitor_id = s.visitor_id
      WHERE s.session_id IS NULL
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 4: SESSION ANALYSIS
    // ════════════════════════════════════════════════════════════════
    section('PHASE 4: SESSION ANALYSIS');

    console.log('\n-- 4a. Sessions per day --');
    show(await q(`
      SELECT DATE(created_at) AS day, COUNT(*) AS sessions,
             COUNT(DISTINCT visitor_id) AS unique_visitors
      FROM tracker_sessions
      GROUP BY DATE(created_at) ORDER BY day
    `));

    console.log('\n-- 4b. Page views per session distribution --');
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
    `));

    console.log('\n-- 4c. Sessions with most page views --');
    show(await q(`
      SELECT pv.session_id, COUNT(*) AS pv_count,
             MAX(s.device_type) AS device, MAX(s.bot_score) AS bot_score,
             MAX(s.visitor_id) AS visitor_id
      FROM tracker_page_views pv
      JOIN tracker_sessions s ON pv.session_id = s.session_id
      GROUP BY pv.session_id
      HAVING COUNT(*) > 5
      ORDER BY pv_count DESC LIMIT 15
    `));

    console.log('\n-- 4d. Bounce rate --');
    show(await q(`
      WITH sess_pv AS (
        SELECT session_id, COUNT(*) AS pv FROM tracker_page_views GROUP BY session_id
      )
      SELECT
        COUNT(*) AS total_sessions,
        COUNT(*) FILTER (WHERE pv = 1) AS bounced,
        ROUND(100.0 * COUNT(*) FILTER (WHERE pv = 1) / NULLIF(COUNT(*), 0), 2) AS bounce_rate
      FROM sess_pv
    `));

    console.log('\n-- 4e. Cumulative time distribution --');
    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(cumulative_time_s) AS has_value,
        COUNT(*) FILTER (WHERE cumulative_time_s IS NULL) AS null_count,
        COUNT(*) FILTER (WHERE cumulative_time_s = 0) AS zero_count,
        COUNT(*) FILTER (WHERE cumulative_time_s < 0) AS negative,
        ROUND(AVG(cumulative_time_s)::numeric, 2) AS avg_time,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cumulative_time_s) AS median_time,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY cumulative_time_s) AS p95_time,
        MAX(cumulative_time_s) AS max_time
      FROM tracker_sessions
      WHERE cumulative_time_s IS NOT NULL
    `));

    console.log('\n-- 4f. Bot score distribution --');
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
    `));

    console.log('\n-- 4g. Bot score breakdown --');
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
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 5: PAGE VIEW ANALYSIS
    // ════════════════════════════════════════════════════════════════
    section('PHASE 5: PAGE VIEW ANALYSIS');

    console.log('\n-- 5a. Performance metrics distribution --');
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
    `));

    console.log('\n-- 5b. FCP > LCP (should be rare) --');
    show(await q(`
      SELECT COUNT(*) AS fcp_gt_lcp
      FROM tracker_page_views
      WHERE fcp_ms IS NOT NULL AND lcp_ms IS NOT NULL AND fcp_ms > lcp_ms
    `));

    console.log('\n-- 5c. time_on_page_final_ms distribution --');
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
    `));

    console.log('\n-- 5d. URL path analysis --');
    show(await q(`
      SELECT url_path, COUNT(*) AS cnt
      FROM tracker_page_views WHERE url_path IS NOT NULL
      GROUP BY url_path ORDER BY cnt DESC LIMIT 15
    `));

    console.log('\n-- 5e. Page type distribution --');
    show(await q(`
      SELECT page_type, COUNT(*) AS cnt
      FROM tracker_page_views GROUP BY page_type ORDER BY cnt DESC
    `));

    console.log('\n-- 5f. Duplicate page views (same session + url + same second) --');
    show(await q(`
      SELECT session_id, url_path, DATE_TRUNC('second', viewed_at) AS ts, COUNT(*) AS cnt
      FROM tracker_page_views
      GROUP BY session_id, url_path, DATE_TRUNC('second', viewed_at)
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC LIMIT 15
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 6: EVENT ANALYSIS
    // ════════════════════════════════════════════════════════════════
    section('PHASE 6: EVENT ANALYSIS');

    console.log('\n-- 6a. Event name distribution --');
    show(await q(`
      SELECT event_name, COUNT(*) AS cnt
      FROM tracker_events GROUP BY event_name ORDER BY cnt DESC
    `));

    console.log('\n-- 6b. Action distribution --');
    show(await q(`
      SELECT action, COUNT(*) AS cnt
      FROM tracker_events GROUP BY action ORDER BY cnt DESC LIMIT 10
    `));

    console.log('\n-- 6c. Signal ID distribution --');
    show(await q(`
      SELECT signal_id, COUNT(*) AS cnt
      FROM tracker_events WHERE signal_id IS NOT NULL
      GROUP BY signal_id ORDER BY cnt DESC LIMIT 15
    `));

    console.log('\n-- 6d. Events per page view --');
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
    `));

    console.log('\n-- 6e. Page views with excessive events --');
    show(await q(`
      SELECT page_view_id, COUNT(*) AS ev_count
      FROM tracker_events
      GROUP BY page_view_id HAVING COUNT(*) > 50
      ORDER BY ev_count DESC LIMIT 10
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 7: HEARTBEAT ANALYSIS
    // ════════════════════════════════════════════════════════════════
    section('PHASE 7: HEARTBEAT ANALYSIS');

    console.log('\n-- 7a. Heartbeat coverage --');
    show(await q(`
      SELECT
        (SELECT COUNT(*) FROM tracker_page_views) AS total_page_views,
        (SELECT COUNT(DISTINCT page_view_id) FROM tracker_raw_heartbeats) AS pv_with_heartbeats,
        (SELECT COUNT(*) FROM tracker_raw_heartbeats) AS total_heartbeats,
        ROUND(100.0 *
          (SELECT COUNT(DISTINCT page_view_id) FROM tracker_raw_heartbeats) /
          NULLIF((SELECT COUNT(*) FROM tracker_page_views), 0),
        2) AS heartbeat_coverage_pct
    `));

    console.log('\n-- 7b. cumulative_active_ms distribution --');
    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cumulative_active_ms IS NULL) AS null_count,
        COUNT(*) FILTER (WHERE cumulative_active_ms <= 0) AS zero_or_neg,
        ROUND(AVG(cumulative_active_ms)::numeric, 0) AS avg_ms,
        MIN(cumulative_active_ms) AS min_ms,
        MAX(cumulative_active_ms) AS max_ms
      FROM tracker_raw_heartbeats
    `));

    console.log('\n-- 7c. Heartbeat session_id vs page_view session_id consistency --');
    show(await q(`
      SELECT COUNT(*) AS session_id_mismatch
      FROM tracker_raw_heartbeats hb
      JOIN tracker_page_views pv ON hb.page_view_id = pv.page_view_id
      WHERE hb.session_id != pv.session_id
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 8: TEMPORAL ANOMALIES
    // ════════════════════════════════════════════════════════════════
    section('PHASE 8: TEMPORAL ANOMALIES');

    console.log('\n-- 8a. Events before their page view --');
    show(await q(`
      SELECT COUNT(*) AS events_before_pageview
      FROM tracker_events e
      JOIN tracker_page_views pv ON e.page_view_id = pv.page_view_id
      WHERE e.event_at < pv.viewed_at - INTERVAL '5 seconds'
    `));

    console.log('\n-- 8b. Page views before session creation --');
    show(await q(`
      SELECT COUNT(*) AS pv_before_session
      FROM tracker_page_views pv
      JOIN tracker_sessions s ON pv.session_id = s.session_id
      WHERE pv.viewed_at < s.created_at - INTERVAL '5 seconds'
    `));

    console.log('\n-- 8c. Heartbeat before page view --');
    show(await q(`
      SELECT COUNT(*) AS hb_before_pv
      FROM tracker_raw_heartbeats hb
      JOIN tracker_page_views pv ON hb.page_view_id = pv.page_view_id
      WHERE hb.cumulative_heartbeat_at < pv.viewed_at
    `));

    console.log('\n-- 8d. Hourly distribution --');
    show(await q(`
      SELECT EXTRACT(HOUR FROM viewed_at)::int AS hour_utc, COUNT(*) AS page_views
      FROM tracker_page_views
      GROUP BY hour_utc ORDER BY hour_utc
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 9: UTM & TRAFFIC
    // ════════════════════════════════════════════════════════════════
    section('PHASE 9: UTM & TRAFFIC');

    console.log('\n-- 9a. UTM completeness --');
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
    `));

    console.log('\n-- 9b. Top UTM sources --');
    show(await q(`
      SELECT utm_source, COUNT(*) AS cnt
      FROM tracker_sessions WHERE utm_source IS NOT NULL
      GROUP BY utm_source ORDER BY cnt DESC LIMIT 10
    `));

    console.log('\n-- 9c. Device type --');
    show(await q(`
      SELECT device_type, COUNT(*) AS cnt,
             ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) AS pct
      FROM tracker_sessions GROUP BY device_type ORDER BY cnt DESC
    `));

    console.log('\n-- 9d. Country --');
    show(await q(`
      SELECT country_code, COUNT(*) AS cnt,
             ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) AS pct
      FROM tracker_sessions GROUP BY country_code ORDER BY cnt DESC LIMIT 10
    `));

    console.log('\n-- 9e. OS --');
    show(await q(`
      SELECT os_name, COUNT(*) AS cnt
      FROM tracker_sessions GROUP BY os_name ORDER BY cnt DESC LIMIT 10
    `));

    console.log('\n-- 9f. Browser --');
    show(await q(`
      SELECT browser_name, COUNT(*) AS cnt
      FROM tracker_sessions GROUP BY browser_name ORDER BY cnt DESC LIMIT 10
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 10: VISITOR ANALYSIS
    // ════════════════════════════════════════════════════════════════
    section('PHASE 10: VISITOR ANALYSIS');

    console.log('\n-- 10a. Visitors with most sessions --');
    show(await q(`
      SELECT s.visitor_id, COUNT(*) AS sessions,
             MIN(s.created_at) AS first_session, MAX(s.created_at) AS last_session,
             MAX(s.bot_score) AS max_bot_score
      FROM tracker_sessions s
      GROUP BY s.visitor_id
      ORDER BY sessions DESC LIMIT 15
    `));

    console.log('\n-- 10b. Session per visitor distribution --');
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
    `));

    console.log('\n-- 10c. Visitor first_seen_at vs actual first session --');
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
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 11: DUPLICATE DETECTION
    // ════════════════════════════════════════════════════════════════
    section('PHASE 11: DUPLICATE DETECTION');

    console.log('\n-- 11a. Duplicate visitor_ids in tracker_visitors --');
    show(await q(`
      SELECT visitor_id, COUNT(*) AS cnt
      FROM tracker_visitors GROUP BY visitor_id HAVING COUNT(*) > 1
      ORDER BY cnt DESC LIMIT 10
    `));

    console.log('\n-- 11b. Duplicate sessions (same visitor + same second) --');
    show(await q(`
      SELECT visitor_id, DATE_TRUNC('second', created_at) AS ts, COUNT(*) AS cnt
      FROM tracker_sessions
      GROUP BY visitor_id, DATE_TRUNC('second', created_at)
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC LIMIT 10
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 12: INDEX ANALYSIS
    // ════════════════════════════════════════════════════════════════
    section('PHASE 12: INDEX GAPS');

    console.log('\n-- 12a. Missing useful indexes --');
    show(await q(`
      SELECT 'tracker_sessions' AS tbl, 'visitor_id' AS col,
        EXISTS(SELECT 1 FROM pg_indexes WHERE tablename = 'tracker_sessions' AND indexdef LIKE '%visitor_id%') AS has_index
      UNION ALL
      SELECT 'tracker_sessions', 'created_at',
        EXISTS(SELECT 1 FROM pg_indexes WHERE tablename = 'tracker_sessions' AND indexdef LIKE '%created_at%')
      UNION ALL
      SELECT 'tracker_sessions', 'utm_source',
        EXISTS(SELECT 1 FROM pg_indexes WHERE tablename = 'tracker_sessions' AND indexdef LIKE '%utm_source%')
      UNION ALL
      SELECT 'tracker_sessions', 'country_code',
        EXISTS(SELECT 1 FROM pg_indexes WHERE tablename = 'tracker_sessions' AND indexdef LIKE '%country_code%')
      UNION ALL
      SELECT 'tracker_page_views', 'url_path',
        EXISTS(SELECT 1 FROM pg_indexes WHERE tablename = 'tracker_page_views' AND indexdef LIKE '%url_path%')
      UNION ALL
      SELECT 'tracker_raw_heartbeats', 'no_primary_key',
        EXISTS(SELECT 1 FROM pg_indexes WHERE tablename = 'tracker_raw_heartbeats' AND indexdef LIKE 'CREATE UNIQUE%')
    `));

    // ════════════════════════════════════════════════════════════════
    // PHASE 13: DATA CONSISTENCY CHECKS
    // ════════════════════════════════════════════════════════════════
    section('PHASE 13: DATA CONSISTENCY');

    console.log('\n-- 13a. entry_page_path stores full URLs? --');
    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE entry_page_path LIKE 'https://%') AS full_urls,
        COUNT(*) FILTER (WHERE entry_page_path LIKE '/%') AS relative_paths,
        COUNT(*) FILTER (WHERE entry_page_path IS NULL) AS null_paths
      FROM tracker_sessions
    `));

    console.log('\n-- 13b. page_views url_path stores full URLs? --');
    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE url_path LIKE 'https://%') AS full_urls,
        COUNT(*) FILTER (WHERE url_path LIKE '/%') AS relative_paths,
        COUNT(*) FILTER (WHERE url_path IS NULL) AS null_paths
      FROM tracker_page_views
    `));

    console.log('\n-- 13c. Referrer (misspelled column) analysis --');
    show(await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(refferer) AS has_referrer,
        COUNT(*) FILTER (WHERE refferer = '') AS empty_referrer,
        COUNT(*) FILTER (WHERE refferer IS NULL) AS null_referrer
      FROM tracker_sessions
    `));

    console.log('\n-- 13d. property_dump contents sample --');
    show(await q(`
      SELECT property_dump
      FROM tracker_sessions
      WHERE property_dump != '{}'::jsonb
      LIMIT 5
    `));

    console.log('\n-- 13e. Table bloat --');
    show(await q(`
      SELECT relname, n_live_tup, n_dead_tup,
             CASE WHEN n_live_tup > 0
               THEN ROUND(100.0 * n_dead_tup / n_live_tup, 2)
               ELSE 0 END AS dead_pct,
             last_autovacuum
      FROM pg_stat_user_tables
      WHERE relname LIKE 'tracker_%'
      ORDER BY n_dead_tup DESC
    `));

    console.log('\n\n=== ANALYSIS COMPLETE ===');
  } catch (error) {
    console.error('Analysis failed:', error);
  } finally {
    await pool.end();
  }
}

main();
