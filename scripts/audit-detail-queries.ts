import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function q(sql: string, params: unknown[] = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

function section(title: string) {
  console.log('\n' + '═'.repeat(80));
  console.log('  ' + title);
  console.log('═'.repeat(80));
}

function json(rows: unknown[]) {
  console.log(JSON.stringify(rows, null, 2));
}

async function main() {
  try {
    // ──────────────────────────────────────────
    // FE-1: Sessions with zero page views (the 61 ghost sessions)
    // ──────────────────────────────────────────
    section('FE-1: Sessions with ZERO page views');
    json(await q(`
      SELECT s.session_id, s.visitor_id, s.created_at, s.ip::text, s.user_agent,
             s.device_type, s.os_name, s.browser_name, s.bot_score,
             s.entry_page_path, s.utm_source, s.referrer
      FROM tracker_sessions s
      LEFT JOIN tracker_page_views pv ON s.session_id = pv.session_id
      WHERE pv.page_view_id IS NULL
      ORDER BY s.created_at
      LIMIT 20
    `));

    // ──────────────────────────────────────────
    // FE-2: Duplicate page views (same session + same url + same second)
    // ──────────────────────────────────────────
    section('FE-2: Duplicate page views — full detail');
    json(await q(`
      WITH dups AS (
        SELECT session_id, url_path, DATE_TRUNC('second', viewed_at) AS ts, COUNT(*) AS cnt
        FROM tracker_page_views
        GROUP BY session_id, url_path, DATE_TRUNC('second', viewed_at)
        HAVING COUNT(*) > 1
      )
      SELECT pv.page_view_id, pv.session_id, pv.url_path, pv.viewed_at,
             pv.page_type, pv.referrer_url
      FROM tracker_page_views pv
      JOIN dups d ON pv.session_id = d.session_id
        AND pv.url_path = d.url_path
        AND DATE_TRUNC('second', pv.viewed_at) = d.ts
      ORDER BY pv.session_id, pv.viewed_at
    `));

    // ──────────────────────────────────────────
    // FE-3: Duplicate events (same pv + event + action + signal + same second)
    // ──────────────────────────────────────────
    section('FE-3: Duplicate events — full detail');
    json(await q(`
      WITH dup_keys AS (
        SELECT page_view_id, event_name, action, signal_id,
               DATE_TRUNC('second', event_at) AS ts, COUNT(*) AS cnt
        FROM tracker_events
        GROUP BY page_view_id, event_name, action, signal_id, DATE_TRUNC('second', event_at)
        HAVING COUNT(*) > 1
      )
      SELECT e.event_id, e.page_view_id, e.event_name, e.action, e.signal_id,
             e.event_at, e.event_properties
      FROM tracker_events e
      JOIN dup_keys dk ON e.page_view_id = dk.page_view_id
        AND e.event_name IS NOT DISTINCT FROM dk.event_name
        AND e.action IS NOT DISTINCT FROM dk.action
        AND e.signal_id IS NOT DISTINCT FROM dk.signal_id
        AND DATE_TRUNC('second', e.event_at) = dk.ts
      ORDER BY e.page_view_id, e.event_at
      LIMIT 40
    `));

    // ──────────────────────────────────────────
    // FE-4: Duplicate session pair
    // ──────────────────────────────────────────
    section('FE-4: Duplicate sessions (same visitor + same second)');
    json(await q(`
      WITH dup AS (
        SELECT visitor_id, DATE_TRUNC('second', created_at) AS ts
        FROM tracker_sessions
        GROUP BY visitor_id, DATE_TRUNC('second', created_at)
        HAVING COUNT(*) > 1
      )
      SELECT s.session_id, s.visitor_id, s.created_at, s.ip::text,
             s.user_agent, s.entry_page_path, s.device_type
      FROM tracker_sessions s
      JOIN dup d ON s.visitor_id = d.visitor_id
        AND DATE_TRUNC('second', s.created_at) = d.ts
      ORDER BY s.visitor_id, s.created_at
    `));

    // ──────────────────────────────────────────
    // FE-5: Empty referrer_url in page_views
    // ──────────────────────────────────────────
    section('FE-5: Page views with empty string referrer_url (sample)');
    json(await q(`
      SELECT pv.page_view_id, pv.session_id, pv.url_path, pv.viewed_at,
             pv.referrer_url, pv.page_type
      FROM tracker_page_views pv
      WHERE pv.referrer_url = ''
      ORDER BY pv.viewed_at
      LIMIT 10
    `));

    // ──────────────────────────────────────────
    // FE-6: FCP > LCP anomalies
    // ──────────────────────────────────────────
    section('FE-6: Page views where FCP > LCP');
    json(await q(`
      SELECT pv.page_view_id, pv.session_id, pv.url_path, pv.viewed_at,
             pv.fcp_ms, pv.lcp_ms, pv.tti_ms, pv.dcl_ms, pv.load_ms,
             s.device_type, s.os_name, s.browser_name
      FROM tracker_page_views pv
      JOIN tracker_sessions s ON pv.session_id = s.session_id
      WHERE pv.fcp_ms IS NOT NULL AND pv.lcp_ms IS NOT NULL AND pv.fcp_ms > pv.lcp_ms
    `));

    // ──────────────────────────────────────────
    // FE-7: Extreme FCP/LCP outliers (>10s)
    // ──────────────────────────────────────────
    section('FE-7: FCP or LCP > 10 seconds');
    json(await q(`
      SELECT pv.page_view_id, pv.session_id, pv.url_path, pv.viewed_at,
             pv.fcp_ms, pv.lcp_ms, pv.tti_ms, pv.load_ms,
             s.device_type, s.os_name, s.browser_name, s.bot_score
      FROM tracker_page_views pv
      JOIN tracker_sessions s ON pv.session_id = s.session_id
      WHERE pv.fcp_ms > 10000 OR pv.lcp_ms > 10000
      ORDER BY GREATEST(COALESCE(pv.fcp_ms,0), COALESCE(pv.lcp_ms,0)) DESC
    `));

    // ──────────────────────────────────────────
    // FE-8: Events fired before their page view
    // ──────────────────────────────────────────
    section('FE-8: Events >5s before their page view');
    json(await q(`
      SELECT e.event_id, e.page_view_id, e.event_name, e.action, e.signal_id,
             e.event_at, pv.viewed_at,
             EXTRACT(EPOCH FROM (e.event_at - pv.viewed_at))::int AS diff_seconds
      FROM tracker_events e
      JOIN tracker_page_views pv ON e.page_view_id = pv.page_view_id
      WHERE e.event_at < pv.viewed_at - INTERVAL '5 seconds'
      ORDER BY diff_seconds
    `));

    // ──────────────────────────────────────────
    // FE-9: NULL page_type page views
    // ──────────────────────────────────────────
    section('FE-9: Page views with NULL page_type');
    json(await q(`
      SELECT pv.page_view_id, pv.session_id, pv.url_path, pv.viewed_at,
             pv.page_type, s.entry_page_path, s.device_type
      FROM tracker_page_views pv
      JOIN tracker_sessions s ON pv.session_id = s.session_id
      WHERE pv.page_type IS NULL
      ORDER BY pv.viewed_at
    `));

    // ──────────────────────────────────────────
    // FE-10: Signal ID inconsistency
    // ──────────────────────────────────────────
    section('FE-10: Testimonial signal_id variants');
    json(await q(`
      SELECT signal_id, COUNT(*) AS cnt,
             COUNT(DISTINCT page_view_id) AS unique_page_views
      FROM tracker_events
      WHERE signal_id ILIKE '%testimonial%'
      GROUP BY signal_id
      ORDER BY cnt DESC
    `));

    // Sample pages using each variant
    json(await q(`
      SELECT DISTINCT e.signal_id, pv.url_path
      FROM tracker_events e
      JOIN tracker_page_views pv ON e.page_view_id = pv.page_view_id
      WHERE e.signal_id ILIKE '%testimonial%'
      ORDER BY e.signal_id, pv.url_path
    `));

    // ──────────────────────────────────────────
    // FE-11: {gclid} unresolved macro
    // ──────────────────────────────────────────
    section('FE-11: Sessions with literal {gclid} click ID');
    json(await q(`
      SELECT s.session_id, s.visitor_id, s.created_at, s.source_click_id,
             s.utm_source, s.utm_medium, s.utm_campaign,
             s.entry_page_path, s.referrer, s.device_type
      FROM tracker_sessions s
      WHERE s.source_click_id = '{gclid}'
      ORDER BY s.created_at
    `));

    // ──────────────────────────────────────────
    // FE-12: entry_page_path mismatches
    // ──────────────────────────────────────────
    section('FE-12: entry_page_path vs first page view mismatch');
    json(await q(`
      WITH first_pv AS (
        SELECT DISTINCT ON (session_id) session_id, page_view_id, url_path, viewed_at
        FROM tracker_page_views
        ORDER BY session_id, viewed_at ASC
      )
      SELECT s.session_id, s.entry_page_path, fp.url_path AS first_pv_path,
             fp.page_view_id, fp.viewed_at, s.created_at
      FROM tracker_sessions s
      JOIN first_pv fp ON s.session_id = fp.session_id
      WHERE s.entry_page_path IS DISTINCT FROM fp.url_path
    `));

    // ──────────────────────────────────────────
    // FE-13: Heartbeat coverage detail
    // ──────────────────────────────────────────
    section('FE-13: The 3 page views WITH heartbeats (to understand what works)');
    json(await q(`
      SELECT DISTINCT hb.page_view_id, hb.session_id,
             pv.url_path, pv.viewed_at, pv.page_type,
             s.device_type, s.os_name, s.browser_name,
             COUNT(*) OVER (PARTITION BY hb.page_view_id) AS heartbeat_count,
             MAX(hb.cumulative_active_ms) OVER (PARTITION BY hb.page_view_id) AS max_active_ms
      FROM tracker_raw_heartbeats hb
      JOIN tracker_page_views pv ON hb.page_view_id = pv.page_view_id
      JOIN tracker_sessions s ON hb.session_id = s.session_id
    `));

    // ──────────────────────────────────────────
    // FE-14: Huge screen dimension
    // ──────────────────────────────────────────
    section('FE-14: Page view with screen dimension > 5000');
    json(await q(`
      SELECT pv.page_view_id, pv.session_id, pv.url_path,
             pv.screen_width, pv.screen_height,
             s.device_type, s.os_name, s.browser_name, s.user_agent
      FROM tracker_page_views pv
      JOIN tracker_sessions s ON pv.session_id = s.session_id
      WHERE pv.screen_width > 5000 OR pv.screen_height > 5000
    `));

    // ──────────────────────────────────────────
    // BE-1: UTM medium storing ad group IDs
    // ──────────────────────────────────────────
    section('BE/CONFIG: UTM medium values (top 20)');
    json(await q(`
      SELECT utm_medium, COUNT(*) AS cnt
      FROM tracker_sessions
      WHERE utm_medium IS NOT NULL
      GROUP BY utm_medium
      ORDER BY cnt DESC LIMIT 20
    `));

    // ──────────────────────────────────────────
    // BE-2: Cloudflare IPs being stored
    // ──────────────────────────────────────────
    section('BE: Cloudflare/proxy IPs stored instead of real visitor IPs');
    json(await q(`
      SELECT s.ip::text, COUNT(*) AS sessions, COUNT(DISTINCT s.visitor_id) AS visitors,
             ARRAY_AGG(DISTINCT s.device_type) AS devices
      FROM tracker_sessions s
      WHERE s.ip::text LIKE '104.28.%'
      GROUP BY s.ip
      ORDER BY sessions DESC
    `));

    console.log('\n=== DETAIL QUERIES COMPLETE ===');
  } catch (error) {
    console.error('Failed:', error);
  } finally {
    await pool.end();
  }
}

main();
