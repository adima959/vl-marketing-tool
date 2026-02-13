import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env.local' });
const pool = mysql.createPool({ host: process.env.MARIADB_HOST, port: parseInt(process.env.MARIADB_PORT || '3306'), user: process.env.MARIADB_USER, password: process.env.MARIADB_PASSWORD, database: process.env.MARIADB_DATABASE, connectTimeout: 15000 });

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = params.length > 0 ? await pool.execute(sql, params) : await pool.query(sql);
  return rows as T[];
}

const START = '2026-02-02 00:00:00';
const END = '2026-02-09 23:59:59';
const SOURCES = ['adwords', 'google'];

async function main(): Promise<void> {
  console.log(`=== Feb 2 - Feb 9, Google Ads (Adwords), Denmark ===\n`);

  // 1. All trials — no exclusions (what CRM likely shows)
  const allTrials = await query<{ trials: number; approved: number; on_hold: number }>(`
    SELECT
      COUNT(DISTINCT i.id) AS trials,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS approved,
      COUNT(DISTINCT CASE WHEN i.on_hold_date IS NOT NULL THEN i.id END) AS on_hold
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) = 'denmark'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);
  console.log('1. ALL trials (no upsell exclusion, COALESCE source):');
  console.log(`   trials=${allTrials[0]?.trials}, approved=${allTrials[0]?.approved}, on_hold=${allTrials[0]?.on_hold}`);

  // 2. With upsell exclusion (what dashboard/marketing should show)
  const noUpsell = await query<{ trials: number; approved: number; on_hold: number }>(`
    SELECT
      COUNT(DISTINCT i.id) AS trials,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS approved,
      COUNT(DISTINCT CASE WHEN i.on_hold_date IS NOT NULL THEN i.id END) AS on_hold
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);
  console.log('2. With upsell exclusion (dashboard trial query):');
  console.log(`   trials=${noUpsell[0]?.trials}, approved=${noUpsell[0]?.approved}, on_hold=${noUpsell[0]?.on_hold}`);

  // 3. Old code — invoice source only, no COALESCE, no upsell exclusion
  const oldCode = await query<{ trials: number; approved: number; on_hold: number }>(`
    SELECT
      COUNT(DISTINCT i.id) AS trials,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS approved,
      COUNT(DISTINCT CASE WHEN i.on_hold_date IS NOT NULL THEN i.id END) AS on_hold
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) = 'denmark'
      AND LOWER(sr.source) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);
  console.log('3. Old code (invoice source only, no COALESCE, no upsell excl):');
  console.log(`   trials=${oldCode[0]?.trials}, approved=${oldCode[0]?.approved}, on_hold=${oldCode[0]?.on_hold}`);

  // 4. Subscription count for reference
  const subs = await query<{ subs: number }>(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);
  console.log(`4. Subscriptions (with upsell exclusion): ${subs[0]?.subs}`);

  // 5. Breakdown: upsell trials
  const upsellTrials = await query<{ trials: number; approved: number }>(`
    SELECT
      COUNT(DISTINCT i.id) AS trials,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS approved
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND s.tag LIKE '%parent-sub-id=%'
      AND LOWER(c.country) = 'denmark'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);
  console.log(`5. Upsell trials only: trials=${upsellTrials[0]?.trials}, approved=${upsellTrials[0]?.approved}`);

  // 6. Check: trials with NULL invoice source that get COALESCE'd to Adwords
  const nullInvSource = await query<{ trials: number; approved: number }>(`
    SELECT
      COUNT(DISTINCT i.id) AS trials,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS approved
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
      AND i.source_id IS NULL
      AND LOWER(sr_sub.source) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);
  console.log(`6. NULL invoice source, COALESCE to Adwords (non-upsell): trials=${nullInvSource[0]?.trials}, approved=${nullInvSource[0]?.approved}`);

  console.log('\n=== Summary ===');
  console.log(`CRM expects:     97 trials`);
  console.log(`Marketing shows: 92 trials`);
  console.log(`Dashboard shows: 87 trials, 4 on hold`);
  console.log(`\nBreakdown from queries above:`);
  console.log(`  All trials (no excl):      ${allTrials[0]?.trials}`);
  console.log(`  - upsell trials:           ${upsellTrials[0]?.trials}`);
  console.log(`  = non-upsell trials:       ${noUpsell[0]?.trials} (approved=${noUpsell[0]?.approved}, on_hold=${noUpsell[0]?.on_hold})`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
