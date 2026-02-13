/**
 * Prove: invoice source (sr) vs subscription source (sr_sub) causes the 51 vs 53 gap
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const maria = await mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
  });

  const START = '2026-02-08';
  const END = '2026-02-11 23:59:59';

  // Exactly what the modal count query does: sr.source = invoice source only
  const [invoiceSource] = await maria.query(`
    SELECT COUNT(DISTINCT c.id) as customers, COUNT(DISTINCT s.id) as subs
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('MODAL (sr.source = invoice):  ', (invoiceSource as any)[0]);

  // With COALESCE: checks invoice first, falls back to subscription
  const [coalesceSource] = await maria.query(`
    SELECT COUNT(DISTINCT c.id) as customers, COUNT(DISTINCT s.id) as subs
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN ('adwords', 'google')
  `, [START, END]);
  console.log('COALESCE(inv, sub):           ', (coalesceSource as any)[0]);

  // Subscription source only (what the aggregate CRM query uses in tracking mode)
  const [subSource] = await maria.query(`
    SELECT COUNT(DISTINCT c.id) as customers, COUNT(DISTINCT s.id) as subs
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
      AND LOWER(sr_sub.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log('TABLE (sr_sub.source = sub):  ', (subSource as any)[0]);

  // Find the 2 missing customers
  const [missing] = await maria.query(`
    SELECT s.id as sub_id, s.customer_id, c.first_name, c.last_name,
      sr_sub.source as sub_source, sr_inv.source as inv_source
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    LEFT JOIN source sr_inv ON sr_inv.id = i.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
      AND LOWER(sr_sub.source) IN ('adwords', 'google')
      AND (sr_inv.source IS NULL OR LOWER(sr_inv.source) NOT IN ('adwords', 'google'))
  `, [START, END]);
  console.log('\nCustomers with Google sub-source but NOT Google invoice-source:');
  for (const row of (missing as any[])) {
    console.log('  sub=' + row.sub_id + ', customer=' + row.customer_id + ' (' + row.first_name + ' ' + row.last_name + '), sub_source=' + row.sub_source + ', inv_source=' + row.inv_source);
  }

  await maria.end();
}

main().catch(console.error);
