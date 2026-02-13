/**
 * Debug script: Compare marketing report vs dashboard CRM counts
 * Investigates why marketing report shows fewer subs/trials/customers than dashboard
 * for DK / Google Ads in date range 2026-01-12 to 2026-02-09
 */
import mysql from 'mysql2/promise';
import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const START = '2026-01-12';
const END = '2026-02-09 23:59:59';

async function main() {
  // Connect to MariaDB
  const maria = await mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
  });

  // Connect to PostgreSQL
  const pg = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('=== DASHBOARD perspective (no tracking ID validation) ===\n');

  // 1. Dashboard counts for DK (all sources)
  const [dashDk] = await maria.query(`
    SELECT
      COUNT(DISTINCT s.id) AS subs,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
  `, [START, END]);
  console.log('Dashboard DK (all sources):', (dashDk as any)[0]);

  // 2. Dashboard counts for DK + adwords source
  const [dashDkGoogle] = await maria.query(`
    SELECT
      COUNT(DISTINCT s.id) AS subs,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Dashboard DK + Google source:', (dashDkGoogle as any)[0]);

  console.log('\n=== MARKETING REPORT perspective (tracking ID validation) ===\n');

  // 3. Marketing CRM query: subs with valid tracking IDs + Google source
  const [mktgGoogle] = await maria.query(`
    SELECT
      COUNT(DISTINCT s.id) AS subs,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Marketing subs (valid tracking + Google source):', (mktgGoogle as any)[0]);

  // 4. How many subs have Google source but MISSING tracking IDs?
  const [missingTracking] = await maria.query(`
    SELECT
      COUNT(DISTINCT s.id) AS subs,
      SUM(CASE WHEN s.tracking_id_4 IS NULL OR s.tracking_id_4 = 'null' THEN 1 ELSE 0 END) AS missing_campaign,
      SUM(CASE WHEN s.tracking_id_2 IS NULL OR s.tracking_id_2 = 'null' THEN 1 ELSE 0 END) AS missing_adset,
      SUM(CASE WHEN s.tracking_id IS NULL OR s.tracking_id = 'null' THEN 1 ELSE 0 END) AS missing_ad
    FROM subscription s
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND (
        s.tracking_id_4 IS NULL OR s.tracking_id_4 = 'null'
        OR s.tracking_id_2 IS NULL OR s.tracking_id_2 = 'null'
        OR s.tracking_id IS NULL OR s.tracking_id = 'null'
      )
  `, [START, END]);
  console.log('Google subs with MISSING tracking IDs:', (missingTracking as any)[0]);

  // 5. What are the actual tracking IDs for those missing subs?
  const [missingDetails] = await maria.query(`
    SELECT
      s.id,
      s.tracking_id_4 as campaign_id,
      s.tracking_id_2 as adset_id,
      s.tracking_id as ad_id,
      sr.source,
      s.date_create
    FROM subscription s
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND (
        s.tracking_id_4 IS NULL OR s.tracking_id_4 = 'null'
        OR s.tracking_id_2 IS NULL OR s.tracking_id_2 = 'null'
        OR s.tracking_id IS NULL OR s.tracking_id = 'null'
      )
    LIMIT 20
  `, [START, END]);
  console.log('\nSample missing tracking subs:');
  for (const row of (missingDetails as any[])) {
    console.log('  sub ' + row.id + ': campaign=' + row.campaign_id + ', adset=' + row.adset_id + ', ad=' + row.ad_id + ', source=' + row.source + ', date=' + row.date_create);
  }

  console.log('\n=== CROSS-DATABASE MATCHING ===\n');

  // 6. Get all unique tracking tuples from MariaDB subs (Google, valid tracking)
  const [crmTuples] = await maria.query(`
    SELECT DISTINCT s.tracking_id_4 AS campaign_id, s.tracking_id_2 AS adset_id, s.tracking_id AS ad_id
    FROM subscription s
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('CRM has ' + (crmTuples as any[]).length + ' unique tracking tuples (Google, valid)');

  // 7. Get all unique tracking tuples from PostgreSQL (Google Ads)
  const pgResult = await pg.query(`
    SELECT DISTINCT m.campaign_id, m.adset_id, m.ad_id
    FROM merged_ads_spending m
    WHERE m.date::date BETWEEN $1::date AND $2::date
      AND LOWER(m.network) = 'google ads'
      AND m.campaign_id IS NOT NULL
      AND m.adset_id IS NOT NULL
      AND m.ad_id IS NOT NULL
  `, ['2026-01-12', '2026-02-09']);
  console.log('PostgreSQL has ' + pgResult.rows.length + ' unique tracking tuples (Google Ads)');

  // 8. Find CRM tuples NOT in PostgreSQL (JS-side set comparison)
  const pgTupleSet = new Set(
    pgResult.rows.map((r: any) => [r.campaign_id, r.adset_id, r.ad_id].join('|'))
  );
  const crmOnlyTuples = (crmTuples as any[]).filter(
    (r: any) => !pgTupleSet.has([r.campaign_id, r.adset_id, r.ad_id].join('|'))
  );
  console.log('CRM tuples NOT in PostgreSQL:', crmOnlyTuples.length);

  if (crmOnlyTuples.length > 0) {
    console.log('\nSample CRM-only tuples (first 10):');
    for (const t of crmOnlyTuples.slice(0, 10)) {
      console.log('  campaign=' + t.campaign_id + ', adset=' + t.adset_id + ', ad=' + t.ad_id);
    }
  }

  // 9. Find PostgreSQL tuples NOT in CRM (JS-side set comparison)
  const crmTupleSet = new Set(
    (crmTuples as any[]).map((r: any) => [r.campaign_id, r.adset_id, r.ad_id].join('|'))
  );
  const pgOnlyTuples = pgResult.rows.filter(
    (r: any) => !crmTupleSet.has([r.campaign_id, r.adset_id, r.ad_id].join('|'))
  );
  console.log('\nPostgreSQL tuples NOT in CRM:', pgOnlyTuples.length);

  console.log('\n=== TRIAL COUNTS ===\n');

  // 10. Trial counts — dashboard style (no tracking validation)
  const [trialsDashDk] = await maria.query(`
    SELECT COUNT(DISTINCT i.id) AS trials
    FROM invoice i
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) = 'denmark'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Dashboard trials DK + Google:', (trialsDashDk as any)[0]);

  // 11. Trial counts — marketing style (invoice tracking validation)
  const [trialsMktg] = await maria.query(`
    SELECT COUNT(DISTINCT i.id) AS trials
    FROM invoice i
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND i.tracking_id_4 IS NOT NULL AND i.tracking_id_4 != 'null'
      AND i.tracking_id_2 IS NOT NULL AND i.tracking_id_2 != 'null'
      AND i.tracking_id IS NOT NULL AND i.tracking_id != 'null'
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Marketing trials (invoice tracking + Google):', (trialsMktg as any)[0]);

  // 12. Trial invoices with Google source but missing tracking IDs
  const [trialsMissing] = await maria.query(`
    SELECT COUNT(DISTINCT i.id) AS trials
    FROM invoice i
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND (
        i.tracking_id_4 IS NULL OR i.tracking_id_4 = 'null'
        OR i.tracking_id_2 IS NULL OR i.tracking_id_2 = 'null'
        OR i.tracking_id IS NULL OR i.tracking_id = 'null'
      )
  `, [START, END]);
  console.log('Google trials with MISSING invoice tracking:', (trialsMissing as any)[0]);

  console.log('\n=== SOURCE ANALYSIS ===\n');

  // 13. Check what sources exist for DK subs
  const [sourceBreakdown] = await maria.query(`
    SELECT
      COALESCE(sr.source, '(no source)') AS source,
      COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
    GROUP BY sr.source
    ORDER BY subs DESC
  `, [START, END]);
  console.log('DK subscription sources:');
  for (const row of (sourceBreakdown as any[])) {
    console.log(`  ${row.source}: ${row.subs} subs`);
  }

  // 14. Subs with NULL source
  const [nullSource] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
      AND s.source_id IS NULL
  `, [START, END]);
  console.log('\nDK subs with NULL source_id:', (nullSource as any)[0]);

  await maria.end();
  await pg.end();
}

main().catch(console.error);
