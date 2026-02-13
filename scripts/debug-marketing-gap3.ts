/**
 * Debug script part 3: Find exactly where 112 subs are lost
 * CRM shows 494 subs, marketing report shows 382.
 * Peel back each filter layer to find the culprit.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const START = '2026-01-12';
const END = '2026-02-09 23:59:59';

async function main() {
  const maria = await mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
  });

  console.log('=== PEEL BACK EACH FILTER LAYER ===\n');

  // Layer 0: Raw subs with Google source, date range only
  const [layer0] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Layer 0 - Raw Google subs (date only):', (layer0 as any)[0].subs);

  // Layer 1: + upsell exclusion
  const [layer1] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log('Layer 1 - + upsell exclusion:', (layer1 as any)[0].subs);

  // Layer 2: + tracking ID validation
  const [layer2] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
  `, [START, END]);
  console.log('Layer 2 - + tracking validation:', (layer2 as any)[0].subs);

  // Layer 2b: Without upsell exclusion but with tracking validation
  const [layer2b] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
  `, [START, END]);
  console.log('Layer 2b - tracking validation WITHOUT upsell exclusion:', (layer2b as any)[0].subs);

  // Layer 3: + DK country filter (from customer)
  const [layer3] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
  `, [START, END]);
  console.log('Layer 3 - + DK customer country (no tracking val):', (layer3 as any)[0].subs);

  console.log('\n=== WHAT DOES 494 REPRESENT? ===\n');

  // Try: Google subs without upsell exclusion, no country filter
  const [noExcl] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Google subs, no upsell excl, no country:', (noExcl as any)[0].subs);

  // Try: Google subs without upsell exclusion, DK country
  const [noExclDk] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND LOWER(c.country) = 'denmark'
  `, [START, END]);
  console.log('Google subs, no upsell excl, DK:', (noExclDk as any)[0].subs);

  // Try: Google subs with tracking validation, no upsell, no country
  const [trackNoExcl] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
  `, [START, END]);
  console.log('Google subs, tracking val, no upsell, no country:', (trackNoExcl as any)[0].subs);

  // Check: invoice-based source vs subscription-based source
  const [invSource] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr_inv ON sr_inv.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND (LOWER(sr_inv.source) IN ('adwords', 'google') OR LOWER(sr_sub.source) IN ('adwords', 'google'))
  `, [START, END]);
  console.log('\nGoogle subs via invoice OR sub source:', (invSource as any)[0].subs);

  // Check which source_id the CRM likely uses
  const [sourceId] = await maria.query(`
    SELECT sr.source, sr.id
    FROM source sr
    WHERE LOWER(sr.source) IN ('adwords', 'google')
  `, []);
  console.log('\nGoogle source IDs in source table:');
  for (const row of (sourceId as any[])) {
    console.log('  id=' + row.id + ', source=' + row.source);
  }

  // Try without upsell exclusion, DK, Feb only
  const [febOnly] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND LOWER(c.country) = 'denmark'
  `, ['2026-02-01', '2026-02-09 23:59:59']);
  console.log('\nGoogle subs, DK, Feb 1-9 only:', (febOnly as any)[0].subs);

  // Check date range used by the CRM screenshot - maybe it's Dec 1?
  const [dec1] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND LOWER(c.country) = 'denmark'
  `, ['2025-12-01', '2026-02-09 23:59:59']);
  console.log('Google subs, DK, Dec 1 2025 - Feb 9 2026:', (dec1 as any)[0]);

  // Try: ALL subs (no source filter) for DK, no upsell exclusion
  const [allDk] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(c.country) = 'denmark'
  `, [START, END]);
  console.log('ALL subs DK (no source filter, no upsell excl):', (allDk as any)[0]);

  // Try: ALL subs DK with upsell exclusion
  const [allDkExcl] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) AS subs,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(c.country) = 'denmark'
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log('ALL subs DK (with upsell excl):', (allDkExcl as any)[0]);

  console.log('\n=== TRIAL LAYER PEELING ===\n');

  // Trial layer 0: Raw Google trials
  const [tl0] = await maria.query(`
    SELECT COUNT(DISTINCT i.id) AS trials
    FROM invoice i
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Trial L0 - Raw Google trials:', (tl0 as any)[0].trials);

  // Trial layer 1: + invoice tracking validation
  const [tl1] = await maria.query(`
    SELECT COUNT(DISTINCT i.id) AS trials
    FROM invoice i
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND i.tracking_id_4 IS NOT NULL AND i.tracking_id_4 != 'null'
      AND i.tracking_id_2 IS NOT NULL AND i.tracking_id_2 != 'null'
      AND i.tracking_id IS NOT NULL AND i.tracking_id != 'null'
  `, [START, END]);
  console.log('Trial L1 - + invoice tracking validation:', (tl1 as any)[0].trials);

  // Trial: with sub source instead of invoice source
  const [tlSubSrc] = await maria.query(`
    SELECT COUNT(DISTINCT i.id) AS trials
    FROM invoice i
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Trials with sub source (not invoice source):', (tlSubSrc as any)[0].trials);

  await maria.end();
}

main().catch(console.error);
