/**
 * Debug: Dashboard shows 412 trials for Balansera/Denmark, CRM shows 422.
 * Run: npx tsx scripts/debug-balansera-trials.ts
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    connectTimeout: 30000,
  });

  const startDate = '2026-01-09 00:00:00';
  const endDate = '2026-02-09 23:59:59';

  const [allSubs] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
       s.id AS sub_id,
       (s.tag IS NOT NULL AND s.tag LIKE '%parent-sub-id=%') AS is_upsell_sub,
       c.country,
       (i.id IS NOT NULL) AS has_trial,
       COALESCE(p.sku, p_sub.sku) AS sku,
       COALESCE(pg.group_name, pg_sub.group_name) AS product_group
     FROM subscription s
     LEFT JOIN customer c ON c.id = s.customer_id
     LEFT JOIN invoice i ON i.id = (
       SELECT MIN(i2.id) FROM invoice i2
       WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
     )
     LEFT JOIN product p_sub ON p_sub.id = s.product_id
     LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
     LEFT JOIN (
       SELECT invoice_id, MIN(product_id) AS product_id
       FROM invoice_product GROUP BY invoice_id
     ) fp ON fp.invoice_id = i.id
     LEFT JOIN product p ON p.id = fp.product_id
     LEFT JOIN product_group pg ON pg.id = p.product_group_id
     WHERE s.date_create BETWEEN ? AND ?
       AND LOWER(c.country) = 'denmark'
       AND (COALESCE(p.sku, p_sub.sku) LIKE '%alans%'
            OR COALESCE(pg.group_name, pg_sub.group_name) LIKE '%alans%')`,
    [startDate, endDate],
  );

  const nonUpsell = allSubs.filter((r) => Number(r.is_upsell_sub) === 0);
  const upsell = allSubs.filter((r) => Number(r.is_upsell_sub) === 1);

  const nonUpsellTrials = nonUpsell.filter((r) => Number(r.has_trial) === 1);
  const upsellTrials = upsell.filter((r) => Number(r.has_trial) === 1);
  const nonUpsellNoTrial = nonUpsell.filter((r) => Number(r.has_trial) === 0);

  console.log('Balansera Denmark subs:', allSubs.length);
  console.log('  Non-upsell:', nonUpsell.length, '| with trial:', nonUpsellTrials.length, '| no trial:', nonUpsellNoTrial.length);
  console.log('  Upsell:', upsell.length, '| with trial:', upsellTrials.length);
  console.log();
  console.log('Dashboard Trials:', nonUpsellTrials.length);
  console.log('All trials (incl upsell):', nonUpsellTrials.length + upsellTrials.length);
  console.log('Gap from upsell:', upsellTrials.length);
  console.log('CRM expected: 422, gap:', 422 - nonUpsellTrials.length);

  if (upsellTrials.length > 0) {
    console.log('\nUpsell subs with trials:');
    for (const r of upsellTrials) {
      console.log('  sub=' + r.sub_id, 'sku=' + r.sku);
    }
  }

  // Check if there are subs where CRM might count trials differently
  // (e.g. subscription has a trial flag vs our invoice-based check)
  console.log('\nNon-upsell subs WITHOUT trial invoice (first 10):');
  for (const r of nonUpsellNoTrial.slice(0, 10)) {
    console.log('  sub=' + r.sub_id, 'sku=' + r.sku);
  }

  // Check if these no-trial subs have ANY invoices
  if (nonUpsellNoTrial.length > 0) {
    const sampleIds = nonUpsellNoTrial.slice(0, 5).map((r) => Number(r.sub_id));
    const ph = sampleIds.map(() => '?').join(',');
    const [invoices] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT i.subscription_id, i.id, i.type, i.deleted, i.total
       FROM invoice i WHERE i.subscription_id IN (${ph})
       ORDER BY i.subscription_id, i.id`,
      sampleIds,
    );
    console.log('\nInvoices for sample no-trial subs:');
    for (const inv of invoices) {
      console.log(`  sub=${inv.subscription_id} inv=${inv.id} type=${inv.type} deleted=${inv.deleted} total=${inv.total}`);
    }
  }

  await conn.end();
}

main().catch(console.error);
