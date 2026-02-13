/**
 * Debug: Verify Jan 11 - Feb 11 2026, Denmark + Google Ads
 * CRM expects: 328 customers, 581 subscriptions, 503 trials
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

const START = '2026-01-11 00:00:00';
const END = '2026-02-11 23:59:59';
const SOURCES = ['adwords', 'google'];

async function main(): Promise<void> {
  console.log(`=== Denmark + Google Ads: ${START} to ${END} ===\n`);
  console.log('Expected CRM: 328 customers, 581 subs, 503 trials\n');

  // 1. CRM raw (no upsell exclusion) — what user sees
  const crmRaw = await query<{
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
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr_sub.source) IN (?, ?)
  `, [START, END, ...SOURCES]);

  const upsells = await query<{ count: number }>(`
    SELECT COUNT(DISTINCT s.id) AS count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND s.tag LIKE '%parent-sub-id=%'
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr_sub.source) IN (?, ?)
  `, [START, END, ...SOURCES]);

  console.log('1. CRM RAW (no upsell exclusion):');
  console.log(`   Customers: ${crmRaw[0]?.customer_count} (expected 328)`);
  console.log(`   Subscriptions: ${crmRaw[0]?.subscription_count} (expected 581)`);
  console.log(`   Upsell subs: ${upsells[0]?.count}`);

  // 2. Dashboard subscription query (with upsell exclusion, COALESCE source)
  const dashSub = await query<{
    customer_count: number;
    subscription_count: number;
    trial_count_left: number;
    trials_approved_left: number;
  }>(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
      COUNT(DISTINCT s.id) AS subscription_count,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count_left,
      COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS trials_approved_left
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (?, ?)
  `, [START, END, ...SOURCES]);

  console.log('\n2. DASHBOARD SUB QUERY (upsell excluded, COALESCE source):');
  console.log(`   Customers: ${dashSub[0]?.customer_count}`);
  console.log(`   Subscriptions: ${dashSub[0]?.subscription_count}`);
  console.log(`   Trials (LEFT JOIN): ${dashSub[0]?.trial_count_left}`);

  // 3. Dashboard trial override (standalone, i.order_date, COALESCE source — our fix)
  const dashTrial = await query<{
    trial_count: number;
    trials_approved: number;
  }>(`
    SELECT
      COUNT(DISTINCT i.id) AS trial_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS trials_approved
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (?, ?)
  `, [START, END, ...SOURCES]);

  console.log('\n3. DASHBOARD TRIAL OVERRIDE (i.order_date, COALESCE source):');
  console.log(`   Trials: ${dashTrial[0]?.trial_count} (expected 503)`);
  console.log(`   Trials Approved: ${dashTrial[0]?.trials_approved}`);

  // 4. CRM raw trials (no upsell exclusion, no deleted filter exclusion — what user might see)
  const crmTrialRaw = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (?, ?)
  `, [START, END, ...SOURCES]);

  const crmTrialNoCoalesce = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr.source) IN (?, ?)
  `, [START, END, ...SOURCES]);

  console.log('\n4. CRM RAW TRIALS (various combos):');
  console.log(`   deleted=0 + COALESCE: ${dashTrial[0]?.trial_count}`);
  console.log(`   no deleted filter + COALESCE: ${crmTrialRaw[0]?.trial_count}`);
  console.log(`   no deleted filter + inv source only: ${crmTrialNoCoalesce[0]?.trial_count}`);

  // 5. OTS
  const dashOts = await query<{
    ots_count: number;
    ots_approved: number;
  }>(`
    SELECT
      COUNT(DISTINCT i.id) AS ots_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS ots_approved
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 3 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (?, ?)
  `, [START, END, ...SOURCES]);

  console.log('\n5. OTS (i.order_date, COALESCE source):');
  console.log(`   OTS: ${dashOts[0]?.ots_count}`);
  console.log(`   OTS Approved: ${dashOts[0]?.ots_approved}`);

  // 6. Summary comparison
  const expectedSubs = Number(crmRaw[0]?.subscription_count) - Number(upsells[0]?.count);
  console.log('\n=== SUMMARY ===');
  console.log(`CRM raw subs: ${crmRaw[0]?.subscription_count}, minus ${upsells[0]?.count} upsells = ${expectedSubs} (dashboard should show)`);
  console.log(`Dashboard subs: ${dashSub[0]?.subscription_count}`);
  console.log(`Dashboard customers: ${dashSub[0]?.customer_count}`);
  console.log(`Dashboard trials (override): ${dashTrial[0]?.trial_count}`);

  const subMatch = Number(dashSub[0]?.subscription_count) === expectedSubs;
  const custMatch = Number(dashSub[0]?.customer_count) === Number(crmRaw[0]?.customer_count);
  console.log(`\nSubs match: ${subMatch ? 'YES' : 'NO — delta=' + (Number(dashSub[0]?.subscription_count) - expectedSubs)}`);
  console.log(`Customers match: ${custMatch ? 'YES' : 'NO — delta=' + (Number(dashSub[0]?.customer_count) - Number(crmRaw[0]?.customer_count))}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
