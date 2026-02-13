/**
 * Debug: Follow-up — check upsell exclusion effect and dashboard grouping
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
  // 1. WITHOUT upsell exclusion — does this give 260?
  const noExclusion = await query<{
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
      AND LOWER(sr_sub.source) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);

  console.log('1. WITHOUT upsell exclusion:');
  console.log(`   Customers: ${noExclusion[0]?.customer_count}`);
  console.log(`   Subscriptions: ${noExclusion[0]?.subscription_count}`);

  // 2. Count upsell subs separately
  const upsells = await query<{
    upsell_sub_count: number;
  }>(`
    SELECT COUNT(DISTINCT s.id) AS upsell_sub_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND s.tag LIKE '%parent-sub-id=%'
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr_sub.source) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);

  console.log(`\n2. UPSELL SUBS (tag LIKE parent-sub-id):  ${upsells[0]?.upsell_sub_count}`);

  // 3. What does the dashboard GROUP BY for geography mode?
  // Dashboard groups by country at depth=0, then by source at depth=1
  // Let me simulate: depth=0, dimension=country
  const dashDepth0 = await query<{
    country: string;
    customer_count: number;
    subscription_count: number;
    trial_count_left: number;
  }>(`
    SELECT
      c.country,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
      COUNT(DISTINCT s.id) AS subscription_count,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count_left
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
    GROUP BY c.country
    HAVING LOWER(c.country) LIKE '%denmark%'
    ORDER BY subscription_count DESC
  `, [START, END]);

  console.log('\n3. DASHBOARD DEPTH=0 (country = Denmark, sub query):');
  for (const row of dashDepth0) {
    console.log(`   ${row.country}: cust=${row.customer_count}, subs=${row.subscription_count}, trials(LEFT)=${row.trial_count_left}`);
  }

  // 4. Trial override for Denmark at depth=0
  const dashTrialDepth0 = await query<{
    country: string;
    trial_count: number;
    trials_approved: number;
  }>(`
    SELECT
      c.country,
      COUNT(DISTINCT i.id) AS trial_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS trials_approved
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
    GROUP BY c.country
    HAVING LOWER(c.country) LIKE '%denmark%'
  `, [START, END]);

  console.log('\n4. DASHBOARD DEPTH=0 TRIAL OVERRIDE (i.order_date):');
  for (const row of dashTrialDepth0) {
    console.log(`   ${row.country}: trials=${row.trial_count}, approved=${row.trials_approved}`);
  }

  // 5. Dashboard depth=1: source under Denmark
  // The dashboard uses COALESCE(sr.source, sr_sub.source) for geography mode
  const dashDepth1 = await query<{
    source: string;
    customer_count: number;
    subscription_count: number;
    trial_count_left: number;
  }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
      COUNT(DISTINCT s.id) AS subscription_count,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count_left
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

  console.log('\n5. DASHBOARD DEPTH=1 (source under Denmark, sub query):');
  let sumSubs = 0;
  let sumCust = 0;
  for (const row of dashDepth1) {
    console.log(`   ${row.source}: cust=${row.customer_count}, subs=${row.subscription_count}, trials(LEFT)=${row.trial_count_left}`);
    sumSubs += Number(row.subscription_count);
    sumCust += Number(row.customer_count);
  }
  console.log(`   SUM: cust=${sumCust}, subs=${sumSubs}`);

  // 6. Trial override at depth=1 under Denmark
  const dashTrialDepth1 = await query<{
    source: string;
    trial_count: number;
    trials_approved: number;
  }>(`
    SELECT
      sr.source,
      COUNT(DISTINCT i.id) AS trial_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS trials_approved
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
    GROUP BY sr.source
    ORDER BY trial_count DESC
  `, [START, END]);

  console.log('\n6. DASHBOARD DEPTH=1 TRIAL OVERRIDE (source under Denmark):');
  let sumTrials = 0;
  for (const row of dashTrialDepth1) {
    console.log(`   ${row.source}: trials=${row.trial_count}, approved=${row.trials_approved}`);
    sumTrials += Number(row.trial_count);
  }
  console.log(`   SUM: trials=${sumTrials}`);

  // 7. Check: does sum of source subs == country total?
  console.log('\n7. COMPARISON:');
  console.log(`   Country level: cust=${dashDepth0[0]?.customer_count}, subs=${dashDepth0[0]?.subscription_count}`);
  console.log(`   Sum of sources: cust=${sumCust}, subs=${sumSubs}`);
  console.log(`   Country trials (override): ${dashTrialDepth0[0]?.trial_count}`);
  console.log(`   Sum of source trials (override): ${sumTrials}`);

  if (sumSubs !== Number(dashDepth0[0]?.subscription_count)) {
    const diff = sumSubs - Number(dashDepth0[0]?.subscription_count);
    console.log(`   ⚠️ SUB MISMATCH: sources sum has ${diff > 0 ? '+' : ''}${diff} vs country total`);
    console.log('   → Likely cause: COALESCE changes source grouping, causing splits/merges');
  }

  // 8. Check individual subscriptions that might split across sources due to COALESCE
  const splitCheck = await query<{
    sub_id: number;
    sub_source: string | null;
    inv_source: string | null;
    coalesced: string | null;
  }>(`
    SELECT
      s.id AS sub_id,
      sr_sub.source AS sub_source,
      sr.source AS inv_source,
      COALESCE(sr.source, sr_sub.source) AS coalesced
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr_sub.source) IN (${SOURCES.map(() => '?').join(',')})
      AND (sr.source IS NULL OR LOWER(sr.source) != LOWER(sr_sub.source))
    LIMIT 20
  `, [START, END, ...SOURCES]);

  console.log('\n8. SUBS WHERE invoice source != subscription source (adwords subs):');
  for (const row of splitCheck) {
    console.log(`   sub=${row.sub_id}: sub_source=${row.sub_source}, inv_source=${row.inv_source}, coalesced=${row.coalesced}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
