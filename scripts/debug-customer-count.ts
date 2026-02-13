/**
 * Debug: Why does customer count differ between table (53) and modal (51/54)?
 * Test case: 08/02/2026 - 11/02/2026, Google Ads / Adwords
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const START = '2026-02-08';
const END = '2026-02-11 23:59:59';

async function main() {
  const maria = await mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
  });

  console.log('=== CUSTOMER COUNTS: EVERY POSSIBLE METHOD ===\n');

  // Method 1: COUNT(DISTINCT c.id) — what modal uses now
  const [m1] = await maria.query(`
    SELECT COUNT(DISTINCT c.id) as total
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('COUNT(DISTINCT c.id):', (m1 as any)[0].total);

  // Method 2: COUNT(DISTINCT s.customer_id) — same thing different column
  const [m2] = await maria.query(`
    SELECT COUNT(DISTINCT s.customer_id) as total
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('COUNT(DISTINCT s.customer_id):', (m2 as any)[0].total);

  // Method 3: COUNT(DISTINCT s.id) — what my bad change uses
  const [m3] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) as total
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('COUNT(DISTINCT s.id):', (m3 as any)[0].total);

  // Method 4: Aggregate style — per tracking tuple, summed
  const [m4] = await maria.query(`
    SELECT SUM(tuple_count) as total
    FROM (
      SELECT COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as tuple_count
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      LEFT JOIN source sr ON sr.id = s.source_id
      WHERE s.date_create BETWEEN ? AND ?
        AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
        AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
        AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
        AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
        AND LOWER(sr.source) IN ('adwords', 'google')
      GROUP BY s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create)
    ) sub
  `, [START, END]);
  console.log('SUM of per-tuple COUNT(DISTINCT customer_id):', (m4 as any)[0].total);

  // Method 5: Without tracking validation
  const [m5] = await maria.query(`
    SELECT COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as total
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Aggregate-style single group (no tracking val):', (m5 as any)[0].total);

  // Method 6: With tracking validation, single group
  const [m6] = await maria.query(`
    SELECT COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as total
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
  console.log('Aggregate-style single group (with tracking val):', (m6 as any)[0].total);

  console.log('\n=== FIND THE DUPLICATES ===\n');

  // Find customers who appear in multiple tracking tuples
  const [dupes] = await maria.query(`
    SELECT s.customer_id, c.first_name, c.last_name, COUNT(DISTINCT CONCAT(s.tracking_id_4, '|', s.tracking_id_2, '|', s.tracking_id)) as tuple_count,
      GROUP_CONCAT(DISTINCT CONCAT(s.tracking_id_4, '|', s.tracking_id_2, '|', s.tracking_id) SEPARATOR '; ') as tuples,
      COUNT(DISTINCT s.id) as sub_count
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
    GROUP BY s.customer_id
    HAVING tuple_count > 1 OR sub_count > 1
    ORDER BY tuple_count DESC, sub_count DESC
  `, [START, END]);
  console.log('Customers with multiple tuples or multiple subs:');
  for (const row of (dupes as any[])) {
    console.log('  customer_id=' + row.customer_id + ' (' + row.first_name + ' ' + row.last_name + '): ' + row.tuple_count + ' tuples, ' + row.sub_count + ' subs');
    console.log('    tuples: ' + row.tuples);
  }

  console.log('\n=== SUBS WITHOUT TRACKING VALIDATION ===\n');

  // How many Google subs exist without tracking validation?
  const [noTrack] = await maria.query(`
    SELECT COUNT(DISTINCT s.id) as subs,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
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
  console.log('Google subs with MISSING tracking IDs:', (noTrack as any)[0]);

  console.log('\n=== MODAL vs TABLE COMPARISON ===\n');

  // Total subs (what the table shows as SUBS)
  const [totalSubs] = await maria.query(`
    SELECT
      SUM(sub_count) as total_subs,
      SUM(cust_count) as total_customers_summed
    FROM (
      SELECT
        COUNT(DISTINCT s.id) as sub_count,
        COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as cust_count
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      LEFT JOIN source sr ON sr.id = s.source_id
      WHERE s.date_create BETWEEN ? AND ?
        AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
        AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
        AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
        AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
        AND LOWER(sr.source) IN ('adwords', 'google')
      GROUP BY s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create)
    ) sub
  `, [START, END]);
  console.log('Aggregate-style totals:');
  console.log('  SUM(sub_count):', (totalSubs as any)[0].total_subs);
  console.log('  SUM(cust_count) [table shows this]:', (totalSubs as any)[0].total_customers_summed);

  // Check if JOINs in the modal cause row multiplication
  console.log('\n=== JOIN MULTIPLICATION CHECK ===\n');

  // Count with minimal joins (just customer)
  const [minJoin] = await maria.query(`
    SELECT COUNT(DISTINCT c.id) as unique_customers, COUNT(DISTINCT s.id) as unique_subs
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Minimal joins (sub + customer + source):', (minJoin as any)[0]);

  // Count with full modal joins (invoice, product, etc.)
  const [fullJoin] = await maria.query(`
    SELECT COUNT(DISTINCT c.id) as unique_customers, COUNT(DISTINCT s.id) as unique_subs, COUNT(*) as raw_rows
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN ('adwords', 'google')
  `, [START, END]);
  console.log('Full modal joins:', (fullJoin as any)[0]);

  // Check: does the source join path matter?
  const [srcPath] = await maria.query(`
    SELECT
      COUNT(DISTINCT CASE WHEN LOWER(sr_sub.source) IN ('adwords', 'google') THEN s.id END) as sub_source_match,
      COUNT(DISTINCT CASE WHEN LOWER(sr_inv.source) IN ('adwords', 'google') THEN s.id END) as inv_source_match,
      COUNT(DISTINCT CASE WHEN LOWER(COALESCE(sr_inv.source, sr_sub.source)) IN ('adwords', 'google') THEN s.id END) as coalesce_match
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    LEFT JOIN source sr_inv ON sr_inv.id = i.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log('\nSource path comparison:');
  console.log('  Subs matching via s.source_id:', (srcPath as any)[0].sub_source_match);
  console.log('  Subs matching via i.source_id:', (srcPath as any)[0].inv_source_match);
  console.log('  Subs matching via COALESCE(inv, sub):', (srcPath as any)[0].coalesce_match);

  await maria.end();
}

main().catch(console.error);
