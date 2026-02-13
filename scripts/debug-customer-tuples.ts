/**
 * Debug: Compare resolved PG tuples (modal) vs cross-product matching (table)
 * for Google Ads, 08/02/2026 - 11/02/2026
 */
import mysql from 'mysql2/promise';
import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const START = '2026-02-08';
const END_MARIA = '2026-02-11 23:59:59';
const END_PG = '2026-02-11';

async function main() {
  const maria = await mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
  });
  const pg = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('=== MODAL: Resolved PG tuples ===\n');

  // What resolveTrackingIdTuples returns (same query as the details route)
  const pgResolved = await pg.query(`
    SELECT DISTINCT m.campaign_id, m.adset_id, m.ad_id
    FROM merged_ads_spending m
    WHERE date::date BETWEEN $1::date AND $2::date
      AND m.campaign_id IS NOT NULL
      AND m.adset_id IS NOT NULL
      AND m.ad_id IS NOT NULL
      AND LOWER(network) = 'google ads'
  `, [START, END_PG]);
  console.log('Resolved PG tuples: ' + pgResolved.rows.length);

  console.log('\n=== TABLE: Cross-product arrays ===\n');

  // What the marketing report query returns for the "Google Ads" row
  const pgArrays = await pg.query(`
    SELECT
      array_agg(DISTINCT m.campaign_id) AS campaign_ids,
      array_agg(DISTINCT m.adset_id) AS adset_ids,
      array_agg(DISTINCT m.ad_id) AS ad_ids
    FROM merged_ads_spending m
    WHERE m.date::date BETWEEN $1::date AND $2::date
      AND LOWER(m.network) = 'google ads'
  `, [START, END_PG]);

  const row = pgArrays.rows[0];
  const campaignIds: string[] = row.campaign_ids || [];
  const adsetIds: string[] = row.adset_ids || [];
  const adIds: string[] = row.ad_ids || [];
  console.log('Array sizes: campaigns=' + campaignIds.length + ', adsets=' + adsetIds.length + ', ads=' + adIds.length);

  // Build cross-product
  const crossProduct = new Set<string>();
  for (const c of campaignIds) {
    for (const a of adsetIds) {
      for (const d of adIds) {
        crossProduct.add([c, a, d].join('|'));
      }
    }
  }
  console.log('Cross-product size: ' + crossProduct.size);

  // Build resolved set
  const resolvedSet = new Set<string>();
  for (const r of pgResolved.rows) {
    resolvedSet.add([r.campaign_id, r.adset_id, r.ad_id].join('|'));
  }
  console.log('Resolved set size: ' + resolvedSet.size);

  // Compare: cross-product keys NOT in resolved
  const crossOnly = [...crossProduct].filter(k => !resolvedSet.has(k));
  console.log('\nCross-product keys NOT in resolved: ' + crossOnly.length);

  // Compare: resolved keys NOT in cross-product (should be 0)
  const resolvedOnly = [...resolvedSet].filter(k => !crossProduct.has(k));
  console.log('Resolved keys NOT in cross-product: ' + resolvedOnly.length);

  console.log('\n=== CRM: Which tuples have customer registrations? ===\n');

  // Get CRM subs with customer registration matching
  const [crmCustomers] = await maria.query(`
    SELECT
      s.tracking_id_4 AS campaign_id,
      s.tracking_id_2 AS adset_id,
      s.tracking_id AS ad_id,
      s.customer_id,
      c.first_name,
      c.last_name
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END_MARIA]);

  // Check which CRM customer tuples are in resolved vs cross-product
  let inResolved = 0;
  let inCrossOnly = 0;
  let inNeither = 0;
  const crossOnlyCustomers: any[] = [];

  for (const crm of (crmCustomers as any[])) {
    const key = [crm.campaign_id, crm.adset_id, crm.ad_id].join('|');
    if (resolvedSet.has(key)) {
      inResolved++;
    } else if (crossProduct.has(key)) {
      inCrossOnly++;
      crossOnlyCustomers.push(crm);
    } else {
      inNeither++;
    }
  }

  console.log('CRM customer subs matched by resolved tuples: ' + inResolved);
  console.log('CRM customer subs matched by cross-product ONLY: ' + inCrossOnly);
  console.log('CRM customer subs in NEITHER: ' + inNeither);

  if (crossOnlyCustomers.length > 0) {
    console.log('\nCustomers only matched by cross-product (missed by modal):');
    for (const crm of crossOnlyCustomers) {
      console.log('  customer ' + crm.customer_id + ' (' + crm.first_name + ' ' + crm.last_name + ')');
      console.log('    tuple: campaign=' + crm.campaign_id + ', adset=' + crm.adset_id + ', ad=' + crm.ad_id);

      // Check: does this exact tuple exist in PG?
      const exists = await pg.query(`
        SELECT COUNT(*) as cnt
        FROM merged_ads_spending m
        WHERE m.campaign_id = $1 AND m.adset_id = $2 AND m.ad_id = $3
          AND m.date::date BETWEEN $4::date AND $5::date
      `, [crm.campaign_id, crm.adset_id, crm.ad_id, START, END_PG]);
      console.log('    Exists in PG spending: ' + (exists.rows[0].cnt > 0 ? 'YES' : 'NO'));
    }
  }

  // Also check: CRM customers WITHOUT tracking validation that have Google source
  const [noTrackCust] = await maria.query(`
    SELECT s.customer_id, c.first_name, c.last_name,
      s.tracking_id_4 AS campaign_id, s.tracking_id_2 AS adset_id, s.tracking_id AS ad_id
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND (
        s.tracking_id_4 IS NULL OR s.tracking_id_4 = 'null'
        OR s.tracking_id_2 IS NULL OR s.tracking_id_2 = 'null'
        OR s.tracking_id IS NULL OR s.tracking_id = 'null'
      )
  `, [START, END_MARIA]);
  console.log('\nGoogle customers with MISSING tracking IDs:');
  for (const row of (noTrackCust as any[])) {
    console.log('  customer ' + row.customer_id + ' (' + row.first_name + ' ' + row.last_name + '): campaign=' + row.campaign_id + ', adset=' + row.adset_id + ', ad=' + row.ad_id);
  }
  if ((noTrackCust as any[]).length === 0) {
    console.log('  (none)');
  }

  await maria.end();
  await pg.end();
}

main().catch(console.error);
