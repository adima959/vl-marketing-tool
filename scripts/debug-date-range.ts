/**
 * Debug: Date range mismatch investigation
 *
 * CRM shows customers=153, subs=260, trials=235 for Denmark + Google Ads
 * on Jan 26 - Feb 11 2026, but dashboard and marketing report disagree.
 *
 * This script establishes ground truth by running queries directly.
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pool = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectTimeout: 15000,
});

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = params.length > 0
    ? await pool.execute(sql, params)
    : await pool.query(sql);
  return rows as T[];
}

const START = '2026-01-26 00:00:00';
const END = '2026-02-11 23:59:59';
const SOURCES = ['adwords', 'google'];

async function main(): Promise<void> {
  console.log(`\n=== CRM Ground Truth: Denmark + Google Ads, ${START} to ${END} ===\n`);

  // 1. Subscription query (mirrors dashboard buildQuery for geography mode)
  // Uses s.date_create, excludes upsell subs
  const subResult = await query<{
    customer_count: number;
    subscription_count: number;
    trial_count: number;
    trials_approved_count: number;
  }>(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
      COUNT(DISTINCT s.id) AS subscription_count,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count,
      COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS trials_approved_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);

  console.log('1. SUBSCRIPTION QUERY (s.date_create, geography mode):');
  console.log(`   Customers: ${subResult[0]?.customer_count}`);
  console.log(`   Subscriptions: ${subResult[0]?.subscription_count}`);
  console.log(`   Trials (LEFT JOIN): ${subResult[0]?.trial_count}`);
  console.log(`   Trials Approved (LEFT JOIN): ${subResult[0]?.trials_approved_count}`);

  // 2. Standalone trial query (mirrors dashboard buildTrialQuery)
  // Uses i.order_date, NO upsell exclusion
  const trialResult = await query<{
    trial_count: number;
    trials_approved_count: number;
  }>(`
    SELECT
      COUNT(DISTINCT i.id) AS trial_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS trials_approved_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr.source) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);

  console.log('\n2. STANDALONE TRIAL QUERY (i.order_date, overrides sub trial counts):');
  console.log(`   Trials: ${trialResult[0]?.trial_count}`);
  console.log(`   Trials Approved: ${trialResult[0]?.trials_approved_count}`);

  // 3. OTS query (mirrors dashboard buildOtsQuery)
  // Uses i.order_date
  const otsResult = await query<{
    ots_count: number;
    ots_approved_count: number;
  }>(`
    SELECT
      COUNT(DISTINCT i.id) AS ots_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS ots_approved_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 3 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr.source) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);

  console.log('\n3. OTS QUERY (i.order_date):');
  console.log(`   OTS: ${otsResult[0]?.ots_count}`);
  console.log(`   OTS Approved: ${otsResult[0]?.ots_approved_count}`);

  // 4. Now check: what does the dashboard actually GROUP BY?
  // Dashboard groups by country at depth=0, source at depth=1
  // When user is looking at source level under Denmark, the query groups by source
  const bySource = await query<{
    source: string;
    customer_count: number;
    subscription_count: number;
  }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
      COUNT(DISTINCT s.id) AS subscription_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) LIKE '%denmark%'
    GROUP BY COALESCE(sr.source, sr_sub.source)
    ORDER BY subscription_count DESC
  `, [START, END]);

  console.log('\n4. ALL SOURCES FOR DENMARK (to see if adwords+google is right):');
  for (const row of bySource) {
    console.log(`   ${row.source}: customers=${row.customer_count}, subs=${row.subscription_count}`);
  }

  // 5. Check: what if source filter uses ONLY sr_sub (subscription source)?
  // The dashboard might filter differently than our direct query
  const subSourceOnly = await query<{
    customer_count: number;
    subscription_count: number;
  }>(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
      COUNT(DISTINCT s.id) AS subscription_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr_sub.source) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);

  console.log('\n5. SUB SOURCE ONLY (sr_sub.source, no COALESCE):');
  console.log(`   Customers: ${subSourceOnly[0]?.customer_count}`);
  console.log(`   Subscriptions: ${subSourceOnly[0]?.subscription_count}`);

  // 6. Check without ANY source filter - just Denmark
  const dkOnly = await query<{
    customer_count: number;
    subscription_count: number;
  }>(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
      COUNT(DISTINCT s.id) AS subscription_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) LIKE '%denmark%'
  `, [START, END]);

  console.log('\n6. DENMARK ONLY (no source filter):');
  console.log(`   Customers: ${dkOnly[0]?.customer_count}`);
  console.log(`   Subscriptions: ${dkOnly[0]?.subscription_count}`);

  // 7. Standalone trials for Denmark only (no source filter)
  const dkTrials = await query<{
    trial_count: number;
    trials_approved_count: number;
  }>(`
    SELECT
      COUNT(DISTINCT i.id) AS trial_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS trials_approved_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
  `, [START, END]);

  console.log('\n7. DENMARK TRIALS (no source filter, i.order_date):');
  console.log(`   Trials: ${dkTrials[0]?.trial_count}`);
  console.log(`   Trials Approved: ${dkTrials[0]?.trials_approved_count}`);

  // 8. Check the dashboard grouping for trials by source under Denmark
  const trialsBySource = await query<{
    source: string;
    trial_count: number;
    trials_approved_count: number;
  }>(`
    SELECT
      sr.source,
      COUNT(DISTINCT i.id) AS trial_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS trials_approved_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
    GROUP BY sr.source
    ORDER BY trial_count DESC
  `, [START, END]);

  console.log('\n8. TRIALS BY SOURCE FOR DENMARK (i.order_date):');
  for (const row of trialsBySource) {
    console.log(`   ${row.source}: trials=${row.trial_count}, approved=${row.trials_approved_count}`);
  }

  // 9. Compare: sum of all sources vs total (check for NULL sources)
  const totalTrials = trialsBySource.reduce((sum, r) => sum + Number(r.trial_count), 0);
  console.log(`   SUM of all sources: ${totalTrials}`);
  console.log(`   Total from query 7: ${dkTrials[0]?.trial_count}`);
  if (totalTrials !== Number(dkTrials[0]?.trial_count)) {
    console.log('   ⚠️ MISMATCH — some trials have NULL source!');
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
