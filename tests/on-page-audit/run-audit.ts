import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

// ─── Env loading ─────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    process.env[key] = val;
  }
});

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL is required in .env.local'); process.exit(1); }
const pool = new Pool({ connectionString: DB_URL });

// ─── Types ───────────────────────────────────────────────────
type CheckStatus = 'pass' | 'warn' | 'fail';
type CheckCategory = 'integrity' | 'duplicates' | 'orphans' | 'consistency' | 'performance' | 'config' | 'overview';

interface CheckResult {
  id: string;
  name: string;
  category: CheckCategory;
  status: CheckStatus;
  value: number | string;
  threshold?: string;
  detail?: unknown[];
}

const results: CheckResult[] = [];

// ─── Helpers ─────────────────────────────────────────────────
async function q(sql: string, params: unknown[] = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

function check(
  id: string,
  name: string,
  category: CheckCategory,
  value: number,
  opts: { warnIf?: number; failIf?: number; detail?: unknown[] } = {}
): CheckResult {
  let status: CheckStatus = 'pass';
  let threshold = '';
  if (opts.failIf !== undefined && value >= opts.failIf) {
    status = 'fail';
    threshold = `fail >= ${opts.failIf}`;
  } else if (opts.warnIf !== undefined && value >= opts.warnIf) {
    status = 'warn';
    threshold = `warn >= ${opts.warnIf}`;
  }

  const result: CheckResult = { id, name, category, status, value, threshold, detail: opts.detail };
  results.push(result);

  const icon = status === 'pass' ? '\x1b[32m PASS\x1b[0m' :
               status === 'warn' ? '\x1b[33m WARN\x1b[0m' :
                                   '\x1b[31m FAIL\x1b[0m';
  console.log(`  ${icon}  ${id.padEnd(22)} ${String(value).padStart(8)}  ${name}`);
  return result;
}

function section(title: string) {
  console.log('\n' + '─'.repeat(70));
  console.log('  ' + title);
  console.log('─'.repeat(70));
}

// ─── Checks ──────────────────────────────────────────────────
async function runAllChecks() {
  // ══════════════════════════════════════════
  // OVERVIEW
  // ══════════════════════════════════════════
  section('TABLE SIZES');

  const counts = await q(`
    SELECT 'sessions' AS tbl, COUNT(*)::int AS cnt FROM tracker_sessions
    UNION ALL SELECT 'page_views', COUNT(*)::int FROM tracker_page_views
    UNION ALL SELECT 'events', COUNT(*)::int FROM tracker_events
    UNION ALL SELECT 'heartbeats', COUNT(*)::int FROM tracker_raw_heartbeats
    UNION ALL SELECT 'visitors', COUNT(*)::int FROM tracker_visitors
  `);
  for (const r of counts) {
    check(`size.${r.tbl}`, `${r.tbl} row count`, 'overview', r.cnt);
  }

  const dateRange = await q(`
    SELECT MIN(created_at) AS earliest, MAX(created_at) AS latest,
           EXTRACT(EPOCH FROM MAX(created_at) - MIN(created_at)) / 3600 AS hours
    FROM tracker_sessions
  `);
  console.log(`  Data spans ${Math.round(dateRange[0].hours)} hours: ${dateRange[0].earliest} → ${dateRange[0].latest}`);

  // ══════════════════════════════════════════
  // ORPHAN DETECTION
  // ══════════════════════════════════════════
  section('ORPHAN DETECTION');

  const sessNoPageViews = await q(`
    SELECT COUNT(*)::int AS cnt
    FROM tracker_sessions s
    LEFT JOIN tracker_page_views pv ON s.session_id = pv.session_id
    WHERE pv.page_view_id IS NULL
  `);
  check('orphan.sess_no_pv', 'Sessions with zero page views (FE-4)', 'orphans',
    sessNoPageViews[0].cnt, { warnIf: 10, failIf: 50 });

  const orphanEvents = await q(`
    SELECT COUNT(*)::int AS cnt
    FROM tracker_events e
    LEFT JOIN tracker_page_views pv ON e.page_view_id = pv.page_view_id
    WHERE pv.page_view_id IS NULL
  `);
  check('orphan.events_no_pv', 'Events referencing missing page views', 'orphans',
    orphanEvents[0].cnt, { warnIf: 1, failIf: 50 });

  const orphanHbPv = await q(`
    SELECT COUNT(*)::int AS cnt
    FROM tracker_raw_heartbeats hb
    LEFT JOIN tracker_page_views pv ON hb.page_view_id = pv.page_view_id
    WHERE pv.page_view_id IS NULL
  `);
  check('orphan.hb_no_pv', 'Heartbeats referencing missing page views', 'orphans',
    orphanHbPv[0].cnt, { warnIf: 1 });

  const orphanVisitors = await q(`
    SELECT COUNT(*)::int AS cnt
    FROM tracker_visitors v
    LEFT JOIN tracker_sessions s ON v.visitor_id = s.visitor_id
    WHERE s.session_id IS NULL
  `);
  check('orphan.visitors_no_sess', 'Visitors with zero sessions', 'orphans',
    orphanVisitors[0].cnt, { warnIf: 1, failIf: 20 });

  const sessNoVisitor = await q(`
    SELECT COUNT(*)::int AS cnt
    FROM tracker_sessions s
    LEFT JOIN tracker_visitors v ON s.visitor_id = v.visitor_id
    WHERE v.visitor_id IS NULL
  `);
  check('orphan.sess_no_visitor', 'Sessions with missing visitor record', 'orphans',
    sessNoVisitor[0].cnt, { warnIf: 1 });

  // ══════════════════════════════════════════
  // DUPLICATE DETECTION
  // ══════════════════════════════════════════
  section('DUPLICATE DETECTION');

  const dupPv = await q(`
    SELECT COUNT(*)::int AS cnt FROM (
      SELECT 1 FROM tracker_page_views
      GROUP BY session_id, url_path, DATE_TRUNC('second', viewed_at)
      HAVING COUNT(*) > 1
    ) x
  `);
  const dupPvDetail = await q(`
    SELECT session_id, url_path, DATE_TRUNC('second', viewed_at) AS ts, COUNT(*)::int AS cnt
    FROM tracker_page_views
    GROUP BY session_id, url_path, DATE_TRUNC('second', viewed_at)
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC LIMIT 10
  `);
  check('dup.page_views', 'Duplicate page view groups (FE-1)', 'duplicates',
    dupPv[0].cnt, { warnIf: 1, failIf: 10, detail: dupPvDetail });

  const dupEv = await q(`
    SELECT COUNT(*)::int AS cnt FROM (
      SELECT 1 FROM tracker_events
      GROUP BY page_view_id, event_name, action, signal_id, DATE_TRUNC('second', event_at)
      HAVING COUNT(*) > 1
    ) x
  `);
  const dupEvDetail = await q(`
    SELECT page_view_id, event_name, action, signal_id,
           DATE_TRUNC('second', event_at) AS ts, COUNT(*)::int AS cnt
    FROM tracker_events
    GROUP BY page_view_id, event_name, action, signal_id, DATE_TRUNC('second', event_at)
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC LIMIT 10
  `);
  check('dup.events', 'Duplicate event groups (FE-2)', 'duplicates',
    dupEv[0].cnt, { warnIf: 1, failIf: 20, detail: dupEvDetail });

  const dupSess = await q(`
    SELECT COUNT(*)::int AS cnt FROM (
      SELECT 1 FROM tracker_sessions
      GROUP BY visitor_id, DATE_TRUNC('second', created_at)
      HAVING COUNT(*) > 1
    ) x
  `);
  check('dup.sessions', 'Duplicate session groups (FE-3)', 'duplicates',
    dupSess[0].cnt, { warnIf: 1, failIf: 5 });

  // ══════════════════════════════════════════
  // TEMPORAL ANOMALIES
  // ══════════════════════════════════════════
  section('TEMPORAL ANOMALIES');

  const evBeforePv = await q(`
    SELECT COUNT(*)::int AS cnt
    FROM tracker_events e
    JOIN tracker_page_views pv ON e.page_view_id = pv.page_view_id
    WHERE e.event_at < pv.viewed_at - INTERVAL '5 seconds'
  `);
  check('time.events_before_pv', 'Events >5s before their page view (FE-10)', 'consistency',
    evBeforePv[0].cnt, { warnIf: 1, failIf: 10 });

  const pvBeforeSess = await q(`
    SELECT COUNT(*)::int AS cnt
    FROM tracker_page_views pv
    JOIN tracker_sessions s ON pv.session_id = s.session_id
    WHERE pv.viewed_at < s.created_at - INTERVAL '5 seconds'
  `);
  check('time.pv_before_session', 'Page views >5s before session creation', 'consistency',
    pvBeforeSess[0].cnt, { warnIf: 1 });

  const hbBeforePv = await q(`
    SELECT COUNT(*)::int AS cnt
    FROM tracker_raw_heartbeats hb
    JOIN tracker_page_views pv ON hb.page_view_id = pv.page_view_id
    WHERE hb.cumulative_heartbeat_at < pv.viewed_at
  `);
  check('time.hb_before_pv', 'Heartbeats timestamped before page view', 'consistency',
    hbBeforePv[0].cnt, { warnIf: 1 });

  // ══════════════════════════════════════════
  // DATA CONSISTENCY
  // ══════════════════════════════════════════
  section('DATA CONSISTENCY');

  const entryMismatch = await q(`
    WITH first_pv AS (
      SELECT DISTINCT ON (session_id) session_id, url_path
      FROM tracker_page_views ORDER BY session_id, viewed_at ASC
    )
    SELECT COUNT(*)::int AS cnt
    FROM tracker_sessions s
    JOIN first_pv fp ON s.session_id = fp.session_id
    WHERE s.entry_page_path IS DISTINCT FROM fp.url_path
  `);
  check('consist.entry_path_mismatch', 'entry_page_path != first page view URL (FE-13)', 'consistency',
    entryMismatch[0].cnt, { warnIf: 1 });

  const trailingQ = await q(`
    SELECT COUNT(*)::int AS cnt FROM tracker_sessions WHERE entry_page_path LIKE '%?'
  `);
  check('consist.trailing_question', 'entry_page_path with trailing ?', 'consistency',
    trailingQ[0].cnt, { warnIf: 1 });

  const hbSessionMismatch = await q(`
    SELECT COUNT(*)::int AS cnt
    FROM tracker_raw_heartbeats hb
    JOIN tracker_page_views pv ON hb.page_view_id = pv.page_view_id
    WHERE hb.session_id != pv.session_id
  `);
  check('consist.hb_session_mismatch', 'Heartbeat session_id != page_view session_id', 'consistency',
    hbSessionMismatch[0].cnt, { warnIf: 1, failIf: 1 });

  // ══════════════════════════════════════════
  // PERFORMANCE METRICS QUALITY
  // ══════════════════════════════════════════
  section('PERFORMANCE METRICS');

  const fcpGtLcp = await q(`
    SELECT COUNT(*)::int AS cnt
    FROM tracker_page_views
    WHERE fcp_ms IS NOT NULL AND lcp_ms IS NOT NULL AND fcp_ms > lcp_ms
  `);
  check('perf.fcp_gt_lcp', 'Page views where FCP > LCP', 'performance',
    fcpGtLcp[0].cnt, { warnIf: 1 });

  const fcpOutliers = await q(`
    SELECT COUNT(*)::int AS cnt FROM tracker_page_views WHERE fcp_ms > 30000
  `);
  check('perf.fcp_over_30s', 'FCP > 30 seconds', 'performance',
    fcpOutliers[0].cnt, { warnIf: 1, failIf: 10 });

  const lcpOutliers = await q(`
    SELECT COUNT(*)::int AS cnt FROM tracker_page_views WHERE lcp_ms > 30000
  `);
  check('perf.lcp_over_30s', 'LCP > 30 seconds', 'performance',
    lcpOutliers[0].cnt, { warnIf: 1, failIf: 10 });

  // ══════════════════════════════════════════
  // CONFIG / BACKEND ISSUES
  // ══════════════════════════════════════════
  section('CONFIG / BACKEND');

  const cfIps = await q(`
    SELECT COUNT(*)::int AS cnt FROM tracker_sessions WHERE ip::text LIKE '104.28.%'
  `);
  check('config.cloudflare_ips', 'Sessions with Cloudflare proxy IPs', 'config',
    cfIps[0].cnt, { warnIf: 1 });

  const gclidMacro = await q(`
    SELECT COUNT(*)::int AS cnt FROM tracker_sessions WHERE source_click_id = '{gclid}'
  `);
  check('config.gclid_macro', 'Sessions with unresolved {gclid}', 'config',
    gclidMacro[0].cnt, { warnIf: 1 });


  const noPk = await q(`
    SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END::int AS cnt
    FROM information_schema.table_constraints
    WHERE table_name = 'tracker_raw_heartbeats' AND constraint_type = 'PRIMARY KEY'
  `);
  check('config.heartbeats_pk', 'tracker_raw_heartbeats missing primary key (1=missing)', 'config',
    noPk[0].cnt, { failIf: 1 });

  // ══════════════════════════════════════════
  // SESSION QUALITY METRICS
  // ══════════════════════════════════════════
  section('SESSION QUALITY');

  const bounceRate = await q(`
    WITH sess_pv AS (
      SELECT session_id, COUNT(*)::int AS pv FROM tracker_page_views GROUP BY session_id
    )
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE pv = 1)::int AS bounced,
      ROUND(100.0 * COUNT(*) FILTER (WHERE pv = 1) / NULLIF(COUNT(*), 0), 2)::float AS bounce_rate
    FROM sess_pv
  `);
  check('quality.bounce_rate', `Bounce rate % (${bounceRate[0].bounced}/${bounceRate[0].total})`, 'overview',
    bounceRate[0].bounce_rate, { warnIf: 85, failIf: 95 });

  const botCount = await q(`
    SELECT COUNT(*)::int AS cnt FROM tracker_sessions WHERE bot_score > 0.5
  `);
  check('quality.likely_bots', 'Sessions with bot_score > 0.5', 'overview',
    botCount[0].cnt, { warnIf: 50 });

  const nullDevice = await q(`
    SELECT COUNT(*)::int AS cnt FROM tracker_sessions WHERE device_type IS NULL
  `);
  check('quality.null_device', 'Sessions with NULL device_type', 'overview',
    nullDevice[0].cnt, { warnIf: 10, failIf: 100 });

  // ══════════════════════════════════════════
  // SIGNAL ID CONSISTENCY
  // ══════════════════════════════════════════
  section('SIGNAL ID CONSISTENCY');

  const testimonialVariants = await q(`
    SELECT signal_id, COUNT(*)::int AS cnt
    FROM tracker_events
    WHERE signal_id ILIKE '%testimonial%'
    GROUP BY signal_id ORDER BY cnt DESC
  `);
  check('consist.testimonial_variants', 'Distinct testimonial signal_id variants (FE-9)', 'consistency',
    testimonialVariants.length, { warnIf: 2, detail: testimonialVariants });

  // ══════════════════════════════════════════
  // INDEX HEALTH
  // ══════════════════════════════════════════
  section('INDEX HEALTH');

  const dupIndexes = await q(`
    WITH idx AS (
      SELECT tablename, indexname, indexdef,
             REGEXP_REPLACE(indexdef, '.*USING \\w+ \\((.*)\\)', '\\1') AS cols
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename LIKE 'tracker_%'
    )
    SELECT a.tablename, a.indexname AS idx_a, b.indexname AS idx_b, a.cols
    FROM idx a
    JOIN idx b ON a.tablename = b.tablename AND a.cols = b.cols AND a.indexname < b.indexname
  `);
  check('index.duplicates', 'Duplicate index pairs', 'config',
    dupIndexes.length, { warnIf: 1, detail: dupIndexes });

  const deadTuples = await q(`
    SELECT relname,
           n_live_tup::int AS live,
           n_dead_tup::int AS dead,
           CASE WHEN n_live_tup > 0
             THEN ROUND(100.0 * n_dead_tup / n_live_tup, 2)::float
             ELSE 0 END AS dead_pct
    FROM pg_stat_user_tables
    WHERE relname LIKE 'tracker_%'
    ORDER BY dead_pct DESC
  `);
  for (const r of deadTuples) {
    check(`index.dead_${r.relname.replace('tracker_', '')}`,
      `${r.relname} dead tuple % (${r.dead}/${r.live})`, 'config',
      r.dead_pct, { warnIf: 15, failIf: 30 });
  }
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log('Tracker Data Audit');
  console.log(`Run: ${new Date().toISOString()}`);
  console.log('═'.repeat(70));

  try {
    await runAllChecks();

    // Summary
    const pass = results.filter(r => r.status === 'pass').length;
    const warn = results.filter(r => r.status === 'warn').length;
    const fail = results.filter(r => r.status === 'fail').length;

    console.log('\n' + '═'.repeat(70));
    console.log(`  SUMMARY: \x1b[32m${pass} pass\x1b[0m / \x1b[33m${warn} warn\x1b[0m / \x1b[31m${fail} fail\x1b[0m  (${results.length} total checks)`);
    console.log('═'.repeat(70));

    if (warn + fail > 0) {
      console.log('\n  Issues:');
      for (const r of results.filter(r => r.status !== 'pass')) {
        const icon = r.status === 'warn' ? '\x1b[33mWARN\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
        console.log(`    ${icon}  ${r.id}: ${r.name} = ${r.value}`);
      }
    }

    // Write JSON results
    const outputDir = path.resolve(__dirname, 'results');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const date = new Date().toISOString().split('T')[0];
    const outputPath = path.join(outputDir, `${date}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      run_at: new Date().toISOString(),
      summary: { pass, warn, fail, total: results.length },
      checks: results,
    }, null, 2));
    console.log(`\n  Results saved to: ${outputPath}`);

  } catch (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
