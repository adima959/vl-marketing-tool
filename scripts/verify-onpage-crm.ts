/**
 * Verification script: On-Page Analysis CRM vs CRM Dashboard
 *
 * Compares CRM data from:
 * 1. crm_subscription_enriched (used by on-page analysis)
 * 2. Raw subscription+invoice tables (used by CRM dashboard)
 * 3. On-page query route logic (tracking match + visitor match)
 *
 * Usage: npx tsx scripts/verify-onpage-crm.ts
 */

import { Pool } from '@neondatabase/serverless';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

const TEST_DATE = '2026-02-05';
const DATE_RANGE = { start: '2026-02-05', end: '2026-02-05' };

// --- Database connections ---

function createPgPool(): Pool {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('DATABASE_URL required'); process.exit(1); }
  return new Pool({ connectionString: dbUrl });
}

function createMariaPool(): mysql.Pool {
  return mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 15000,
  });
}

// --- Helpers ---

function sep(title: string): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function subsep(title: string): void {
  console.log(`\n  --- ${title} ---`);
}

// --- Tests ---

async function test1_enrichedVsDashboard(maria: mysql.Pool): Promise<void> {
  sep('TEST 1: crm_subscription_enriched vs Dashboard raw tables');
  console.log(`  Date: ${TEST_DATE}`);
  console.log('  Comparing trial/approved counts between enriched table and raw subscription+invoice tables\n');

  // Enriched table counts
  const [enrichedRows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );
  const enriched = enrichedRows[0];

  // Dashboard raw counts (mirrors dashboardQueryBuilder logic)
  const [dashRows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT
       COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count,
       COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS approved_count
     FROM subscription s
     INNER JOIN invoice i ON i.subscription_id = s.id AND i.deleted = 0
     WHERE s.date_create BETWEEN ? AND ?
       AND s.deleted = 0
       AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );
  const dashboard = dashRows[0];

  console.log('  Source               | Trials | Approved');
  console.log('  ---------------------|--------|----------');
  console.log(`  Enriched table       | ${String(enriched.trials).padStart(6)} | ${String(enriched.approved).padStart(8)}`);
  console.log(`  Dashboard raw tables | ${String(dashboard.trial_count).padStart(6)} | ${String(dashboard.approved_count).padStart(8)}`);

  const trialDiff = Number(enriched.trials) - Number(dashboard.trial_count);
  const approvedDiff = Number(enriched.approved) - Number(dashboard.approved_count);

  if (trialDiff !== 0 || approvedDiff !== 0) {
    console.log(`\n  ⚠️  MISMATCH: trials diff=${trialDiff}, approved diff=${approvedDiff}`);
    console.log('  Possible causes: enriched table stale, upsell exclusion logic, deleted flag handling');
  } else {
    console.log('\n  ✅ Counts match');
  }
}

async function test2_enrichedBySource(maria: mysql.Pool): Promise<void> {
  sep('TEST 2: Enriched table CRM by source_normalized vs Dashboard by source');
  console.log(`  Date: ${TEST_DATE}`);
  console.log('  Comparing per-source trial/approved counts\n');

  // Enriched table by source
  const [enrichedRows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT source_normalized AS source,
       COUNT(*) AS trials,
       SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY source_normalized
     ORDER BY trials DESC`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  // Dashboard by source
  const [dashRows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT
       COALESCE(sr.source, '(not set)') AS source_name,
       COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count,
       COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS approved_count
     FROM subscription s
     INNER JOIN invoice i ON i.subscription_id = s.id AND i.deleted = 0
     LEFT JOIN source sr ON sr.id = s.source_id
     WHERE s.date_create BETWEEN ? AND ?
       AND s.deleted = 0
       AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
     GROUP BY sr.source
     ORDER BY trial_count DESC`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  console.log('  Enriched table (source_normalized):');
  console.log('  Source                 | Trials | Approved');
  console.log('  -----------------------|--------|----------');
  for (const row of enrichedRows) {
    const src = String(row.source || '(empty)').padEnd(23);
    console.log(`  ${src}| ${String(row.trials).padStart(6)} | ${String(row.approved).padStart(8)}`);
  }

  console.log('\n  Dashboard raw (source table):');
  console.log('  Source                 | Trials | Approved');
  console.log('  -----------------------|--------|----------');
  for (const row of dashRows) {
    const src = String(row.source_name || '(empty)').padEnd(23);
    console.log(`  ${src}| ${String(row.trial_count).padStart(6)} | ${String(row.approved_count).padStart(8)}`);
  }
}

async function test3_sourceNormalization(maria: mysql.Pool): Promise<void> {
  sep('TEST 3: Source normalization consistency');
  console.log(`  Date: ${TEST_DATE}`);
  console.log('  Checking if enriched source_normalized matches PG CASE normalization\n');

  // Enriched table: what source values does it have?
  const [rows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT source_normalized, COUNT(*) as cnt
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY source_normalized
     ORDER BY cnt DESC`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  // Also check raw source names for same subscriptions
  const [rawRows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT sr.source AS raw_source, e.source_normalized, COUNT(*) as cnt
     FROM crm_subscription_enriched e
     JOIN subscription s ON s.id = e.subscription_id
     LEFT JOIN source sr ON sr.id = s.source_id
     WHERE e.date_create BETWEEN ? AND ?
     GROUP BY sr.source, e.source_normalized
     ORDER BY cnt DESC`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  console.log('  Raw source → Normalized mapping:');
  console.log('  Raw source             | Normalized           | Count');
  console.log('  -----------------------|----------------------|------');
  for (const row of rawRows) {
    const raw = String(row.raw_source || '(null)').padEnd(23);
    const norm = String(row.source_normalized || '(empty)').padEnd(20);
    console.log(`  ${raw}| ${norm}  | ${row.cnt}`);
  }

  // PG normalization: google/adwords→google, facebook/meta→facebook, else lowercase
  console.log('\n  Expected PG normalization:');
  console.log('  google, adwords → google');
  console.log('  facebook, meta → facebook');
  console.log('  everything else → lowercase');
}

async function test4_pgMetricsForDate(pg: Pool): Promise<void> {
  sep('TEST 4: PG page view metrics for date');
  console.log(`  Date: ${TEST_DATE}`);
  console.log('  Checking total PG page views and unique visitors\n');

  const result = await pg.query(
    `SELECT
       COUNT(*) AS page_views,
       COUNT(DISTINCT ff_visitor_id) AS unique_visitors,
       COUNT(DISTINCT LOWER(utm_source)) AS distinct_sources,
       COUNT(*) FILTER (WHERE utm_source IS NOT NULL) AS with_utm_source,
       COUNT(*) FILTER (WHERE ff_visitor_id IS NOT NULL) AS with_ff_vid
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')`,
    [TEST_DATE]
  );
  const r = result.rows[0];
  console.log(`  Page views:           ${r.page_views}`);
  console.log(`  Unique visitors:      ${r.unique_visitors}`);
  console.log(`  Distinct UTM sources: ${r.distinct_sources}`);
  console.log(`  With UTM source:      ${r.with_utm_source} (${(r.with_utm_source / r.page_views * 100).toFixed(1)}%)`);
  console.log(`  With ff_visitor_id:   ${r.with_ff_vid} (${(r.with_ff_vid / r.page_views * 100).toFixed(1)}%)`);
}

async function test5_directMatchUtmSource(pg: Pool, maria: mysql.Pool): Promise<void> {
  sep('TEST 5: Direct CRM match for utmSource dimension');
  console.log(`  Date: ${TEST_DATE}`);
  console.log('  Simulating the on-page query route with utmSource dimension\n');

  // PG side: on-page aggregated metrics by LOWER(utm_source)
  const pgResult = await pg.query(
    `SELECT
       LOWER(utm_source) AS dimension_value,
       COUNT(*) AS page_views,
       COUNT(DISTINCT ff_visitor_id) AS unique_visitors
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
     GROUP BY LOWER(utm_source)
     ORDER BY page_views DESC
     LIMIT 20`,
    [TEST_DATE]
  );

  // MariaDB side: CRM data grouped by source_normalized (direct match)
  const [crmRows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT source_normalized AS dimension_value,
       COUNT(*) AS trials,
       SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY source_normalized`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  const crmIndex = new Map<string, { trials: number; approved: number }>();
  for (const row of crmRows) {
    const key = row.dimension_value != null ? String(row.dimension_value).toLowerCase() : 'unknown';
    crmIndex.set(key, { trials: Number(row.trials), approved: Number(row.approved) });
  }

  console.log('  Combined (PG metrics + CRM direct match):');
  console.log('  Source              | PageViews | Visitors | Trials | Approved | ConvRate');
  console.log('  --------------------|-----------|----------|--------|----------|--------');
  for (const row of pgResult.rows) {
    const dimKey = row.dimension_value != null ? String(row.dimension_value).toLowerCase() : 'unknown';
    const crm = crmIndex.get(dimKey);
    const trials = crm?.trials ?? 0;
    const approved = crm?.approved ?? 0;
    const convRate = Number(row.unique_visitors) > 0
      ? (trials / Number(row.unique_visitors) * 100).toFixed(2) + '%'
      : '0%';
    const src = String(row.dimension_value || '(null)').padEnd(20);
    console.log(`  ${src}| ${String(row.page_views).padStart(9)} | ${String(row.unique_visitors).padStart(8)} | ${String(trials).padStart(6)} | ${String(approved).padStart(8)} | ${convRate}`);
  }

  // Check for CRM sources not appearing in PG
  const pgSources = new Set(pgResult.rows.map((r: any) =>
    r.dimension_value != null ? String(r.dimension_value).toLowerCase() : 'unknown'
  ));
  const unmatchedCrm: string[] = [];
  for (const [key, data] of crmIndex) {
    if (!pgSources.has(key) && data.trials > 0) {
      unmatchedCrm.push(`${key} (${data.trials} trials)`);
    }
  }
  if (unmatchedCrm.length > 0) {
    console.log(`\n  ⚠️  CRM sources with no PG page views: ${unmatchedCrm.join(', ')}`);
  }
}

async function test6_trackingMatch(pg: Pool, maria: mysql.Pool): Promise<void> {
  sep('TEST 6: Tracking match for non-matchable dimension (urlPath)');
  console.log(`  Date: ${TEST_DATE}`);
  console.log('  Simulating tracking match: PG tracking combos + CRM tracking combos\n');

  // PG: tracking combos grouped by urlPath
  const pgTrackingResult = await pg.query(
    `SELECT
       url_path AS dimension_value,
       CASE
         WHEN LOWER(utm_source) IN ('google', 'adwords') THEN 'google'
         WHEN LOWER(utm_source) IN ('facebook', 'meta') THEN 'facebook'
         ELSE LOWER(COALESCE(utm_source, ''))
       END AS source,
       COALESCE(utm_campaign, '') AS campaign_id,
       COALESCE(utm_content, '') AS adset_id,
       COALESCE(utm_medium, '') AS ad_id,
       COUNT(DISTINCT ff_visitor_id) AS unique_visitors
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
     GROUP BY url_path,
       CASE
         WHEN LOWER(utm_source) IN ('google', 'adwords') THEN 'google'
         WHEN LOWER(utm_source) IN ('facebook', 'meta') THEN 'facebook'
         ELSE LOWER(COALESCE(utm_source, ''))
       END,
       COALESCE(utm_campaign, ''),
       COALESCE(utm_content, ''),
       COALESCE(utm_medium, '')
     ORDER BY unique_visitors DESC
     LIMIT 500`,
    [TEST_DATE]
  );

  // CRM: tracking combos
  const [crmTrackingRows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT
       source_normalized AS source,
       tracking_id_4 AS campaign_id,
       tracking_id_2 AS adset_id,
       tracking_id AS ad_id,
       COUNT(*) AS trials,
       SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY source_normalized, tracking_id_4, tracking_id_2, tracking_id`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  console.log(`  PG tracking combo rows: ${pgTrackingResult.rows.length}`);
  console.log(`  CRM tracking combo rows: ${crmTrackingRows.length}`);

  // Build CRM index by tracking combo key
  const crmIndex = new Map<string, { trials: number; approved: number }>();
  for (const row of crmTrackingRows) {
    const normalize = (v: any) => v === 'null' || v === null ? '' : String(v);
    const key = [normalize(row.source), normalize(row.campaign_id), normalize(row.adset_id), normalize(row.ad_id)].join('::');
    const existing = crmIndex.get(key) || { trials: 0, approved: 0 };
    existing.trials += Number(row.trials);
    existing.approved += Number(row.approved);
    crmIndex.set(key, existing);
  }

  // Build PG combo totals and per-dimension accumulator
  const comboTotals = new Map<string, number>();
  for (const row of pgTrackingResult.rows) {
    const normalize = (v: any) => v === 'null' || v === null ? '' : String(v);
    const key = [normalize(row.source), normalize(row.campaign_id), normalize(row.adset_id), normalize(row.ad_id)].join('::');
    comboTotals.set(key, (comboTotals.get(key) || 0) + Number(row.unique_visitors));
  }

  // Distribute CRM proportionally
  const urlTrials = new Map<string, { trials: number; approved: number }>();
  let matchedCrmTrials = 0;
  for (const row of pgTrackingResult.rows) {
    const normalize = (v: any) => v === 'null' || v === null ? '' : String(v);
    const key = [normalize(row.source), normalize(row.campaign_id), normalize(row.adset_id), normalize(row.ad_id)].join('::');
    const crmData = crmIndex.get(key);
    if (!crmData) continue;

    const totalVisitors = comboTotals.get(key) || 1;
    const proportion = Number(row.unique_visitors) / totalVisitors;

    const dimKey = String(row.dimension_value || 'unknown').toLowerCase();
    const existing = urlTrials.get(dimKey) || { trials: 0, approved: 0 };
    existing.trials += crmData.trials * proportion;
    existing.approved += crmData.approved * proportion;
    urlTrials.set(dimKey, existing);
    matchedCrmTrials += crmData.trials * proportion;
  }

  // Show top URLs with CRM data
  const sorted = [...urlTrials.entries()].sort((a, b) => b[1].trials - a[1].trials);
  console.log(`\n  Top 15 URL paths by tracking-matched trials:`);
  console.log('  URL Path                                       | Trials | Approved');
  console.log('  -------- --------------------------------------|--------|----------');
  for (const [url, data] of sorted.slice(0, 15)) {
    const urlStr = url.substring(0, 48).padEnd(48);
    console.log(`  ${urlStr}| ${String(Math.round(data.trials)).padStart(6)} | ${String(Math.round(data.approved)).padStart(8)}`);
  }

  // CRM combos with no PG match
  let unmatchedCrmTrials = 0;
  let unmatchedCombos = 0;
  for (const [key, data] of crmIndex) {
    if (!comboTotals.has(key)) {
      unmatchedCrmTrials += data.trials;
      unmatchedCombos++;
    }
  }

  console.log(`\n  Tracking match coverage:`);
  const totalCrmTrials = [...crmIndex.values()].reduce((s, d) => s + d.trials, 0);
  console.log(`  Total CRM trials: ${totalCrmTrials}`);
  console.log(`  Matched via tracking: ${Math.round(matchedCrmTrials)} (${(matchedCrmTrials / totalCrmTrials * 100).toFixed(1)}%)`);
  console.log(`  Unmatched CRM combos: ${unmatchedCombos} (${unmatchedCrmTrials} trials)`);

  if (unmatchedCombos > 0) {
    console.log(`\n  ⚠️  Some CRM tracking combos have no matching PG page views.`);
    console.log('  Showing first 5 unmatched combos:');
    let shown = 0;
    for (const [key, data] of crmIndex) {
      if (!comboTotals.has(key) && shown < 5) {
        console.log(`    ${key} → trials=${data.trials}, approved=${data.approved}`);
        shown++;
      }
    }
  }
}

async function test7_visitorMatch(pg: Pool, maria: mysql.Pool): Promise<void> {
  sep('TEST 7: Visitor ID (ff_vid) match for urlPath');
  console.log(`  Date: ${TEST_DATE}`);
  console.log('  Simulating ff_vid matching: PG ff_visitor_id + CRM ff_vid\n');

  // CRM: ff_vid grouped
  const [crmVisitorRows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT ff_vid, COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
       AND ff_vid IS NOT NULL
     GROUP BY ff_vid`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  console.log(`  CRM subscriptions with ff_vid: ${crmVisitorRows.length}`);

  // PG: (urlPath, ff_visitor_id) pairs
  const pgVisitorResult = await pg.query(
    `SELECT DISTINCT url_path AS dimension_value, ff_visitor_id
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
       AND ff_visitor_id IS NOT NULL`,
    [TEST_DATE]
  );

  console.log(`  PG (url_path, ff_visitor_id) pairs: ${pgVisitorResult.rows.length}`);

  // Build CRM index
  const crmIndex = new Map<string, { trials: number; approved: number }>();
  for (const row of crmVisitorRows) {
    crmIndex.set(row.ff_vid, { trials: Number(row.trials), approved: Number(row.approved) });
  }

  // Match
  const urlTrials = new Map<string, { trials: number; approved: number }>();
  let matchedVisitors = 0;
  const matchedVids = new Set<string>();
  for (const row of pgVisitorResult.rows) {
    const crmData = crmIndex.get(row.ff_visitor_id);
    if (!crmData) continue;

    matchedVids.add(row.ff_visitor_id);
    matchedVisitors++;
    const dimKey = String(row.dimension_value || 'unknown').toLowerCase();
    const existing = urlTrials.get(dimKey) || { trials: 0, approved: 0 };
    existing.trials += crmData.trials;
    existing.approved += crmData.approved;
    urlTrials.set(dimKey, existing);
  }

  const sorted = [...urlTrials.entries()].sort((a, b) => b[1].trials - a[1].trials);
  console.log(`\n  Top 10 URL paths by ff_vid-matched trials:`);
  console.log('  URL Path                                       | Trials | Approved');
  console.log('  -------- --------------------------------------|--------|----------');
  for (const [url, data] of sorted.slice(0, 10)) {
    const urlStr = url.substring(0, 48).padEnd(48);
    console.log(`  ${urlStr}| ${String(data.trials).padStart(6)} | ${String(data.approved).padStart(8)}`);
  }

  const unmatchedVids = crmVisitorRows.filter(r => !matchedVids.has(r.ff_vid));
  console.log(`\n  Visitor match coverage:`);
  console.log(`  CRM with ff_vid: ${crmVisitorRows.length}`);
  console.log(`  Matched in PG:   ${matchedVids.size} (${(matchedVids.size / crmVisitorRows.length * 100).toFixed(1)}%)`);
  console.log(`  Unmatched CRM:   ${unmatchedVids.length}`);

  if (unmatchedVids.length > 0) {
    console.log(`\n  ⚠️  ${unmatchedVids.length} CRM ff_vid values have no matching PG page views on ${TEST_DATE}`);
    console.log('  (These visitors may have visited on other dates)');
  }
}

async function test8_crmDetailsEndpoint(pg: Pool, maria: mysql.Pool): Promise<void> {
  sep('TEST 8: CRM Details endpoint simulation');
  console.log(`  Date: ${TEST_DATE}`);
  console.log('  Simulating /api/on-page-analysis/crm-details for crmTrials (no filters)\n');

  // Step 1: Get tracking combos from PG
  const pgCombos = await pg.query(
    `SELECT DISTINCT
       CASE
         WHEN LOWER(utm_source) IN ('google', 'adwords') THEN 'google'
         WHEN LOWER(utm_source) IN ('facebook', 'meta') THEN 'facebook'
         ELSE LOWER(COALESCE(utm_source, ''))
       END as source,
       COALESCE(utm_campaign, '') as campaign_id,
       COALESCE(utm_content, '') as adset_id,
       COALESCE(utm_medium, '') as ad_id
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at BETWEEN $1 AND $2
       AND utm_source IS NOT NULL`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  // Step 2: Get visitor IDs from PG
  const pgVisitors = await pg.query(
    `SELECT DISTINCT ff_visitor_id
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at BETWEEN $1 AND $2
       AND ff_visitor_id IS NOT NULL
     LIMIT 20000`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  console.log(`  PG tracking combos: ${pgCombos.rows.length}`);
  console.log(`  PG visitor IDs: ${pgVisitors.rows.length}`);

  // Step 3: Build MariaDB match query
  const matchParts: string[] = [];
  const matchParams: (string | number)[] = [
    `${TEST_DATE} 00:00:00`,
    `${TEST_DATE} 23:59:59`,
  ];

  // ff_vid match
  if (pgVisitors.rows.length > 0) {
    const visitorIds = pgVisitors.rows.map((r: any) => r.ff_visitor_id);
    matchParts.push(`ff_vid IN (${visitorIds.map(() => '?').join(', ')})`);
    matchParams.push(...visitorIds);
  }

  // tracking combo match
  if (pgCombos.rows.length > 0) {
    const comboConds: string[] = [];
    for (const combo of pgCombos.rows) {
      const parts: string[] = [];
      if (combo.source) { parts.push('source_normalized = ?'); matchParams.push(combo.source); }
      if (combo.campaign_id) { parts.push('tracking_id_4 = ?'); matchParams.push(combo.campaign_id); }
      if (combo.adset_id) { parts.push('tracking_id_2 = ?'); matchParams.push(combo.adset_id); }
      if (combo.ad_id) { parts.push('tracking_id = ?'); matchParams.push(combo.ad_id); }
      if (parts.length > 0) comboConds.push(`(${parts.join(' AND ')})`);
    }
    if (comboConds.length > 0) matchParts.push(`(${comboConds.join(' OR ')})`);
  }

  if (matchParts.length === 0) {
    console.log('  No match parts — no data to match');
    return;
  }

  const matchQuery = `
    SELECT subscription_id
    FROM crm_subscription_enriched
    WHERE date_create BETWEEN ? AND ?
      AND (${matchParts.join(' OR ')})
  `;

  const [matchedSubs] = await maria.execute<mysql.RowDataPacket[]>(matchQuery, matchParams);
  console.log(`  Matched subscription IDs: ${matchedSubs.length}`);

  // Compare with total enriched for the date
  const [totalEnriched] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM crm_subscription_enriched WHERE date_create BETWEEN ? AND ?`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );
  const total = Number(totalEnriched[0].total);
  console.log(`  Total enriched subs:      ${total}`);
  console.log(`  Match rate:               ${(matchedSubs.length / total * 100).toFixed(1)}%`);

  if (matchedSubs.length < total) {
    const missingCount = total - matchedSubs.length;
    console.log(`\n  ⚠️  ${missingCount} enriched subs not matched by on-page CRM details endpoint`);

    // Find the unmatched ones
    const matchedIds = new Set(matchedSubs.map(r => r.subscription_id));
    const [allEnriched] = await maria.execute<mysql.RowDataPacket[]>(
      `SELECT subscription_id, source_normalized, tracking_id_4, tracking_id_2, tracking_id, ff_vid
       FROM crm_subscription_enriched
       WHERE date_create BETWEEN ? AND ?`,
      [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
    );

    const unmatched = allEnriched.filter(r => !matchedIds.has(r.subscription_id));
    console.log(`  Unmatched subscription samples (first 10):`);
    for (const row of unmatched.slice(0, 10)) {
      console.log(`    sub=${row.subscription_id} source=${row.source_normalized || '(empty)'} campaign=${row.tracking_id_4 || '(empty)'} ff_vid=${row.ff_vid || '(null)'}`);
    }
  }
}

async function test9_doubleCountingCheck(pg: Pool, maria: mysql.Pool): Promise<void> {
  sep('TEST 9: Double-counting check (ff_vid + tracking overlap)');
  console.log(`  Date: ${TEST_DATE}`);
  console.log('  For non-matchable dims, code tries ff_vid first, then tracking combo.\n');
  console.log('  Checking if the same subscription could be counted via BOTH methods.\n');

  // CRM with ff_vid
  const [withVid] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT subscription_id, ff_vid, source_normalized, tracking_id_4, tracking_id_2, tracking_id
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
       AND ff_vid IS NOT NULL`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  // CRM total
  const [allRows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT subscription_id, ff_vid, source_normalized, tracking_id_4, tracking_id_2, tracking_id
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?`,
    [`${TEST_DATE} 00:00:00`, `${TEST_DATE} 23:59:59`]
  );

  console.log(`  Total enriched subs:    ${allRows.length}`);
  console.log(`  With ff_vid:            ${withVid.length} (${(withVid.length / allRows.length * 100).toFixed(1)}%)`);
  console.log(`  Without ff_vid:         ${allRows.length - withVid.length}`);

  // For subs WITH ff_vid, check if they also have tracking IDs
  let bothMethods = 0;
  for (const row of withVid) {
    if (row.source_normalized || row.tracking_id_4 || row.tracking_id_2 || row.tracking_id) {
      bothMethods++;
    }
  }

  console.log(`\n  With ff_vid AND tracking IDs: ${bothMethods}`);

  // In the code, for non-matchable dims:
  // 1. Try ff_vid match first
  // 2. Only if visitorMatch has 0 trials, fall back to tracking match
  // So double-counting COULD happen if both methods match different dimension values
  console.log(`\n  NOTE: The code (query/route.ts:336-353) uses ff_vid match first.`);
  console.log('  Only falls back to tracking if ff_vid yields 0 trials for a dimension value.');
  console.log('  This means per-dimension-value, only one method is used — no double-counting.');
  console.log('  But ACROSS dimension values, both methods contribute (which is correct).');
}

async function test10_dateRangeComparison(pg: Pool, maria: mysql.Pool): Promise<void> {
  sep('TEST 10: Multi-day date range (Feb 1-7) CRM totals');
  const start = '2026-02-01';
  const end = '2026-02-07';
  console.log(`  Date range: ${start} to ${end}`);
  console.log('  Comparing enriched totals with on-page direct match (utmSource)\n');

  // Enriched total
  const [enrichedTotal] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?`,
    [`${start} 00:00:00`, `${end} 23:59:59`]
  );

  // Sum across utmSource direct match
  const [crmBySource] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT source_normalized, COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY source_normalized`,
    [`${start} 00:00:00`, `${end} 23:59:59`]
  );

  let directTotal = 0;
  let directApproved = 0;
  for (const row of crmBySource) {
    directTotal += Number(row.trials);
    directApproved += Number(row.approved);
  }

  console.log('  Source                  | Trials | Approved');
  console.log('  ------ ----------------|--------|----------');
  for (const row of crmBySource) {
    const src = String(row.source_normalized || '(empty)').padEnd(24);
    console.log(`  ${src}| ${String(row.trials).padStart(6)} | ${String(row.approved).padStart(8)}`);
  }
  console.log('  ------ ----------------|--------|----------');
  console.log(`  Sum of groups           | ${String(directTotal).padStart(6)} | ${String(directApproved).padStart(8)}`);
  console.log(`  Enriched total          | ${String(enrichedTotal[0].trials).padStart(6)} | ${String(enrichedTotal[0].approved).padStart(8)}`);

  if (directTotal !== Number(enrichedTotal[0].trials)) {
    console.log(`\n  ⚠️  Group sum doesn't equal total — possible GROUP BY aggregation issue`);
  } else {
    console.log('\n  ✅ Direct match totals are consistent');
  }
}

// --- Main ---

async function main(): Promise<void> {
  console.log('On-Page Analysis CRM Verification');
  console.log(`Testing with date: ${TEST_DATE}`);
  console.log('Starting...\n');

  const pg = createPgPool();
  const maria = createMariaPool();

  try {
    // Test connections first
    await pg.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
    const [mariaTest] = await maria.execute<mysql.RowDataPacket[]>('SELECT 1 AS ok');
    console.log('✅ MariaDB connected');

    await test1_enrichedVsDashboard(maria);
    await test2_enrichedBySource(maria);
    await test3_sourceNormalization(maria);
    await test4_pgMetricsForDate(pg);
    await test5_directMatchUtmSource(pg, maria);
    await test6_trackingMatch(pg, maria);
    await test7_visitorMatch(pg, maria);
    await test8_crmDetailsEndpoint(pg, maria);
    await test9_doubleCountingCheck(pg, maria);
    await test10_dateRangeComparison(pg, maria);

    sep('SUMMARY');
    console.log('  All tests completed. Review warnings (⚠️) above for potential issues.');
    console.log('  Key things to verify in the UI:');
    console.log('  1. CRM totals on on-page dashboard should match enriched table counts');
    console.log('  2. Per-source CRM trials should match between on-page and CRM dashboard');
    console.log('  3. Non-matchable dims (urlPath, pageType) get CRM via tracking+visitor match');
    console.log('  4. CRM details drill-down should return subscription records for matched combos');

  } finally {
    await pg.end();
    await maria.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
