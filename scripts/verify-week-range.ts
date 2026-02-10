/**
 * Verify on-page CRM data for Feb 2-7 range.
 * Checks enriched vs dashboard, per-source match, per-day match,
 * and simulates the actual route logic including the adwords→google fix.
 *
 * Usage: node --experimental-strip-types scripts/verify-week-range.ts
 */

import { Pool } from '@neondatabase/serverless';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env.local' });

const START = '2026-02-02';
const END = '2026-02-07';

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
    connectionLimit: 5,
    connectTimeout: 15000,
  });
}

function sep(title: string): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

// --- Test 1: Enriched vs Dashboard totals ---
async function test1(maria: mysql.Pool): Promise<void> {
  sep('TEST 1: Enriched vs Dashboard totals (Feb 2-7)');

  const [enriched] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  const [dashboard] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT
       COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trials,
       COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS approved
     FROM subscription s
     INNER JOIN invoice i ON i.subscription_id = s.id AND i.deleted = 0
     WHERE s.date_create BETWEEN ? AND ?
       AND s.deleted = 0
       AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  const e = enriched[0];
  const d = dashboard[0];
  console.log(`  Enriched:  trials=${e.trials}  approved=${e.approved}`);
  console.log(`  Dashboard: trials=${d.trials}  approved=${d.approved}`);
  const tDiff = Number(e.trials) - Number(d.trials);
  const aDiff = Number(e.approved) - Number(d.approved);
  if (tDiff === 0 && aDiff === 0) console.log('  ✅ Match');
  else console.log(`  ⚠️  MISMATCH: trials diff=${tDiff}, approved diff=${aDiff}`);
}

// --- Test 2: Per-day enriched vs dashboard ---
async function test2(maria: mysql.Pool): Promise<void> {
  sep('TEST 2: Per-day enriched vs dashboard');

  const [enrichedByDay] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT DATE(date_create) AS day, COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY DATE(date_create)
     ORDER BY day`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  const [dashByDay] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT DATE(s.date_create) AS day,
       COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trials,
       COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS approved
     FROM subscription s
     INNER JOIN invoice i ON i.subscription_id = s.id AND i.deleted = 0
     WHERE s.date_create BETWEEN ? AND ?
       AND s.deleted = 0
       AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
     GROUP BY DATE(s.date_create)
     ORDER BY day`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  const dashIndex = new Map(dashByDay.map(r => [String(r.day).substring(0, 10), r]));

  console.log('  Date       | Enr.Trials | Dash.Trials | Enr.Appr | Dash.Appr | Status');
  console.log('  -----------|------------|-------------|----------|-----------|-------');
  for (const row of enrichedByDay) {
    const dayStr = String(row.day).substring(0, 10);
    const d = dashIndex.get(dayStr);
    const dTrials = d ? Number(d.trials) : 0;
    const dApproved = d ? Number(d.approved) : 0;
    const eTrials = Number(row.trials);
    const eApproved = Number(row.approved);
    const ok = eTrials === dTrials && eApproved === dApproved;
    console.log(`  ${dayStr} | ${String(eTrials).padStart(10)} | ${String(dTrials).padStart(11)} | ${String(eApproved).padStart(8)} | ${String(dApproved).padStart(9)} | ${ok ? '✅' : '⚠️  diff t=' + (eTrials - dTrials) + ' a=' + (eApproved - dApproved)}`);
  }
}

// --- Test 3: Per-source enriched vs dashboard ---
async function test3(maria: mysql.Pool): Promise<void> {
  sep('TEST 3: Per-source enriched vs dashboard');

  const [enrichedBySource] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT source_normalized AS src, COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY source_normalized
     ORDER BY trials DESC`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  // Dashboard groups by raw source name — normalize for comparison
  const [dashBySource] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT
       CASE
         WHEN LOWER(sr.source) IN ('google', 'adwords') THEN 'google'
         WHEN LOWER(sr.source) IN ('facebook', 'meta') THEN 'facebook'
         ELSE LOWER(COALESCE(sr.source, ''))
       END AS src,
       COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trials,
       COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS approved
     FROM subscription s
     INNER JOIN invoice i ON i.subscription_id = s.id AND i.deleted = 0
     LEFT JOIN source sr ON sr.id = s.source_id
     WHERE s.date_create BETWEEN ? AND ?
       AND s.deleted = 0
       AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
     GROUP BY src
     ORDER BY trials DESC`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  const dashIndex = new Map(dashBySource.map(r => [r.src, r]));

  console.log('  Source               | Enr.T | Dash.T | Enr.A | Dash.A | Status');
  console.log('  ---------------------|-------|--------|-------|--------|-------');
  for (const row of enrichedBySource) {
    const src = String(row.src || '(empty)');
    const d = dashIndex.get(row.src);
    const dTrials = d ? Number(d.trials) : 0;
    const dApproved = d ? Number(d.approved) : 0;
    const eTrials = Number(row.trials);
    const eApproved = Number(row.approved);
    const ok = eTrials === dTrials && eApproved === dApproved;
    console.log(`  ${src.padEnd(21)}| ${String(eTrials).padStart(5)} | ${String(dTrials).padStart(6)} | ${String(eApproved).padStart(5)} | ${String(dApproved).padStart(6)} | ${ok ? '✅' : '⚠️  t=' + (eTrials - dTrials) + ' a=' + (eApproved - dApproved)}`);
  }
}

// --- Test 4: Simulate utmSource direct match with adwords→google fix ---
async function test4(pg: Pool, maria: mysql.Pool): Promise<void> {
  sep('TEST 4: utmSource direct match (with adwords→google fix)');

  const pgResult = await pg.query(
    `SELECT
       LOWER(utm_source) AS dimension_value,
       COUNT(*) AS page_views,
       COUNT(DISTINCT ff_visitor_id) AS unique_visitors
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
     GROUP BY LOWER(utm_source)
     ORDER BY page_views DESC
     LIMIT 25`,
    [START, END]
  );

  const [crmRows] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT source_normalized AS dimension_value, COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY source_normalized`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  const crmIndex = new Map<string, { trials: number; approved: number }>();
  for (const row of crmRows) {
    const key = row.dimension_value != null ? String(row.dimension_value).toLowerCase() : 'unknown';
    crmIndex.set(key, { trials: Number(row.trials), approved: Number(row.approved) });
  }

  let totalTrialsMatched = 0;
  let totalTrialsCrm = 0;
  for (const [, v] of crmIndex) totalTrialsCrm += v.trials;

  console.log('  Source              | PageViews | Visitors | Trials | Approved | ConvRate');
  console.log('  --------------------|-----------|----------|--------|----------|--------');
  for (const row of pgResult.rows) {
    let lookupKey = row.dimension_value != null ? String(row.dimension_value).toLowerCase() : 'unknown';
    // Apply adwords→google fix
    if (lookupKey === 'adwords') lookupKey = 'google';
    const crm = crmIndex.get(lookupKey);
    const trials = crm?.trials ?? 0;
    const approved = crm?.approved ?? 0;
    totalTrialsMatched += trials;
    const convRate = Number(row.unique_visitors) > 0
      ? (trials / Number(row.unique_visitors) * 100).toFixed(2) + '%'
      : '0%';
    const src = String(row.dimension_value || '(null)').padEnd(20);
    console.log(`  ${src}| ${String(row.page_views).padStart(9)} | ${String(row.unique_visitors).padStart(8)} | ${String(trials).padStart(6)} | ${String(approved).padStart(8)} | ${convRate}`);
  }

  // Check for CRM sources with no PG match
  const pgSources = new Set(pgResult.rows.map((r: any) => {
    let key = r.dimension_value != null ? String(r.dimension_value).toLowerCase() : 'unknown';
    if (key === 'adwords') key = 'google';
    return key;
  }));
  const unmatched: string[] = [];
  for (const [key, data] of crmIndex) {
    if (!pgSources.has(key) && data.trials > 0) {
      unmatched.push(`${key}(${data.trials}t)`);
    }
  }

  console.log(`\n  CRM total trials: ${totalTrialsCrm}`);
  console.log(`  Matched via direct: ${totalTrialsMatched}`);
  if (unmatched.length > 0) {
    console.log(`  ⚠️  Unmatched CRM sources: ${unmatched.join(', ')}`);
  } else {
    console.log('  ✅ All CRM sources matched to PG');
  }
}

// --- Test 5: Per-day per-source detailed check ---
async function test5(pg: Pool, maria: mysql.Pool): Promise<void> {
  sep('TEST 5: Per-day breakdown — PG page views vs CRM trials');

  const pgResult = await pg.query(
    `SELECT
       created_at::date AS day,
       COUNT(*) AS page_views,
       COUNT(DISTINCT ff_visitor_id) AS unique_visitors
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
     GROUP BY created_at::date
     ORDER BY day`,
    [START, END]
  );

  const [crmByDay] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT DATE_FORMAT(date_create, '%Y-%m-%d') AS day,
       COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY DATE_FORMAT(date_create, '%Y-%m-%d')
     ORDER BY day`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  const crmIndex = new Map(crmByDay.map(r => [r.day, r]));

  console.log('  Date       | PG Views | PG Visitors | CRM Trials | CRM Appr | ConvRate');
  console.log('  -----------|----------|-------------|------------|----------|--------');
  for (const row of pgResult.rows) {
    const dayStr = String(row.day).substring(0, 10);
    const crm = crmIndex.get(dayStr);
    const trials = crm ? Number(crm.trials) : 0;
    const approved = crm ? Number(crm.approved) : 0;
    const convRate = Number(row.unique_visitors) > 0
      ? (trials / Number(row.unique_visitors) * 100).toFixed(2) + '%'
      : '0%';
    console.log(`  ${dayStr} | ${String(row.page_views).padStart(8)} | ${String(row.unique_visitors).padStart(11)} | ${String(trials).padStart(10)} | ${String(approved).padStart(8)} | ${convRate}`);
  }
}

// --- Test 6: CRM details endpoint — check match rate per day ---
async function test6(pg: Pool, maria: mysql.Pool): Promise<void> {
  sep('TEST 6: CRM details match rate per day');

  for (let d = 2; d <= 7; d++) {
    const day = `2026-02-0${d}`;

    // Get visitor IDs from PG
    const pgVisitors = await pg.query(
      `SELECT DISTINCT ff_visitor_id
       FROM remote_session_tracker.event_page_view_enriched_v2
       WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
         AND ff_visitor_id IS NOT NULL
       LIMIT 20000`,
      [day]
    );

    // Get tracking combos from PG
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
       WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
         AND utm_source IS NOT NULL`,
      [day]
    );

    // Build MariaDB match
    const matchParts: string[] = [];
    const matchParams: (string | number)[] = [`${day} 00:00:00`, `${day} 23:59:59`];

    if (pgVisitors.rows.length > 0) {
      matchParts.push(`ff_vid IN (${pgVisitors.rows.map(() => '?').join(', ')})`);
      matchParams.push(...pgVisitors.rows.map((r: any) => r.ff_visitor_id));
    }

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

    let matched = 0;
    if (matchParts.length > 0) {
      const [result] = await maria.execute<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM crm_subscription_enriched
         WHERE date_create BETWEEN ? AND ? AND (${matchParts.join(' OR ')})`,
        matchParams
      );
      matched = Number(result[0].cnt);
    }

    const [total] = await maria.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM crm_subscription_enriched WHERE date_create BETWEEN ? AND ?`,
      [`${day} 00:00:00`, `${day} 23:59:59`]
    );
    const totalCount = Number(total[0].cnt);
    const rate = totalCount > 0 ? (matched / totalCount * 100).toFixed(1) : '0';
    const status = matched === totalCount ? '✅' : `⚠️  ${totalCount - matched} unmatched`;

    console.log(`  ${day}: ${matched}/${totalCount} matched (${rate}%) ${status}`);
  }
}

// --- Test 7: Check for duplicate subscription_ids in enriched ---
async function test7(maria: mysql.Pool): Promise<void> {
  sep('TEST 7: Data quality checks on enriched table');

  const [dupes] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT subscription_id, COUNT(*) AS cnt
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY subscription_id
     HAVING COUNT(*) > 1
     LIMIT 10`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  if (dupes.length > 0) {
    console.log(`  ⚠️  Duplicate subscription_ids found: ${dupes.map(r => r.subscription_id).join(', ')}`);
  } else {
    console.log('  ✅ No duplicate subscription_ids');
  }

  // Check for enriched subs where subscription is deleted
  const [deletedSubs] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT e.subscription_id
     FROM crm_subscription_enriched e
     JOIN subscription s ON s.id = e.subscription_id
     WHERE e.date_create BETWEEN ? AND ?
       AND s.deleted = 1
     LIMIT 10`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  if (deletedSubs.length > 0) {
    console.log(`  ⚠️  Enriched subs with deleted subscription: ${deletedSubs.map(r => r.subscription_id).join(', ')}`);
  } else {
    console.log('  ✅ No deleted subscriptions in enriched table');
  }

  // Check for enriched subs where invoice is deleted (the bug we just fixed)
  const [deletedInvoices] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT e.subscription_id
     FROM crm_subscription_enriched e
     JOIN invoice i ON i.subscription_id = e.subscription_id AND i.type = 1
     WHERE e.date_create BETWEEN ? AND ?
       AND i.deleted = 1
       AND NOT EXISTS (
         SELECT 1 FROM invoice i2
         WHERE i2.subscription_id = e.subscription_id AND i2.type = 1 AND i2.deleted = 0
       )
     LIMIT 10`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  if (deletedInvoices.length > 0) {
    console.log(`  ⚠️  Enriched subs with ONLY deleted invoices: ${deletedInvoices.map(r => r.subscription_id).join(', ')}`);
  } else {
    console.log('  ✅ No enriched subs with only-deleted invoices');
  }

  // Check is_approved consistency
  const [approvalMismatch] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT e.subscription_id, e.is_approved,
       MAX(CASE WHEN i.is_marked = 1 AND i.deleted = 0 THEN 1 ELSE 0 END) AS expected_approved
     FROM crm_subscription_enriched e
     JOIN invoice i ON i.subscription_id = e.subscription_id AND i.type = 1 AND i.deleted = 0
     WHERE e.date_create BETWEEN ? AND ?
     GROUP BY e.subscription_id, e.is_approved
     HAVING e.is_approved != expected_approved
     LIMIT 10`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );

  if (approvalMismatch.length > 0) {
    console.log(`  ⚠️  is_approved mismatch: ${approvalMismatch.map(r => `sub=${r.subscription_id} enriched=${r.is_approved} expected=${r.expected_approved}`).join(', ')}`);
  } else {
    console.log('  ✅ is_approved values are consistent');
  }
}

// --- Main ---
async function main(): Promise<void> {
  console.log(`On-Page CRM Verification: ${START} to ${END}\n`);
  const pg = createPgPool();
  const maria = createMariaPool();

  try {
    await pg.query('SELECT 1');
    console.log('✅ PG connected');
    await maria.execute('SELECT 1');
    console.log('✅ MariaDB connected');

    await test1(maria);
    await test2(maria);
    await test3(maria);
    await test4(pg, maria);
    await test5(pg, maria);
    await test6(pg, maria);
    await test7(maria);

    sep('DONE');
  } finally {
    await pg.end();
    await maria.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
