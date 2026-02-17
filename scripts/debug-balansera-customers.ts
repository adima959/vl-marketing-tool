/**
 * Debug: Dashboard shows 368 new customers for Balansera (Denmark), CRM shows 371.
 * Find the 3 missing.
 *
 * Run: npx tsx scripts/debug-balansera-customers.ts
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

  // Get ALL subscriptions with sku like 'balans%' in date range, Denmark only
  const [allSubs] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
       s.id AS sub_id,
       s.date_create,
       s.tag,
       (s.tag IS NOT NULL AND s.tag LIKE '%parent-sub-id=%') AS is_upsell_sub,
       c.id AS customer_id,
       c.date_registered,
       (DATE(c.date_registered) = DATE(s.date_create)) AS is_new_customer,
       c.country,
       COALESCE(p.sku, p_sub.sku) AS sku,
       COALESCE(pg.group_name, pg_sub.group_name) AS product_group,
       COALESCE(p.product_name, p_sub.product_name) AS product_name
     FROM subscription s
     LEFT JOIN customer c ON c.id = s.customer_id
     LEFT JOIN invoice i ON i.id = (
       SELECT MIN(i2.id) FROM invoice i2
       WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
     )
     LEFT JOIN (
       SELECT invoice_id, MIN(product_id) AS product_id
       FROM invoice_product GROUP BY invoice_id
     ) fp ON fp.invoice_id = i.id
     LEFT JOIN product p ON p.id = fp.product_id
     LEFT JOIN product_group pg ON pg.id = p.product_group_id
     LEFT JOIN product p_sub ON p_sub.id = s.product_id
     LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
     WHERE s.date_create BETWEEN ? AND ?
       AND LOWER(c.country) = 'denmark'
       AND (COALESCE(p.sku, p_sub.sku) LIKE '%alans%'
            OR COALESCE(pg.group_name, pg_sub.group_name) LIKE '%alans%')
     ORDER BY s.date_create`,
    [startDate, endDate],
  );

  console.log(`Total Balansera Denmark subscriptions: ${allSubs.length}`);

  const nonUpsell = allSubs.filter((r) => !Number(r.is_upsell_sub));
  const upsell = allSubs.filter((r) => Number(r.is_upsell_sub));
  console.log(`Non-upsell: ${nonUpsell.length}, Upsell: ${upsell.length}`);

  // Dashboard new customers: unique customer_ids where is_new_customer=1, non-upsell only
  const newCustomerIds = new Set<number>();
  for (const row of nonUpsell) {
    if (Number(row.is_new_customer)) {
      newCustomerIds.add(Number(row.customer_id));
    }
  }
  console.log(`Dashboard new customers (non-upsell): ${newCustomerIds.size}`);

  // CRM: all new customers including upsell subs
  const allNewCustomerIds = new Set<number>();
  for (const row of allSubs) {
    if (Number(row.is_new_customer)) {
      allNewCustomerIds.add(Number(row.customer_id));
    }
  }
  console.log(`All new customers (incl. upsell): ${allNewCustomerIds.size}`);

  // Find the missing ones
  const missingFromDashboard = [...allNewCustomerIds].filter((id) => !newCustomerIds.has(id));
  console.log(`\nCustomers in "all" but not "dashboard": ${missingFromDashboard.length}`);
  for (const custId of missingFromDashboard) {
    const subs = allSubs.filter((r) => Number(r.customer_id) === custId);
    console.log(`  Customer ${custId}:`);
    for (const s of subs) {
      console.log(`    sub=${s.sub_id} upsell=${Number(s.is_upsell_sub)} new=${Number(s.is_new_customer)} sku=${s.sku} product=${s.product_name} date=${s.date_create}`);
    }
  }

  // Also: total unique customers (not just new)
  const allCustomerIds = new Set(allSubs.map((r) => Number(r.customer_id)));
  const nonUpsellCustomerIds = new Set(nonUpsell.map((r) => Number(r.customer_id)));
  console.log(`\nTotal unique customers (all): ${allCustomerIds.size}`);
  console.log(`Total unique customers (non-upsell): ${nonUpsellCustomerIds.size}`);

  // Customers only in upsell subs
  const upsellOnlyCustomers = [...allCustomerIds].filter((id) => !nonUpsellCustomerIds.has(id));
  console.log(`Customers with ONLY upsell Balansera subs: ${upsellOnlyCustomers.length}`);
  for (const custId of upsellOnlyCustomers) {
    const subs = allSubs.filter((r) => Number(r.customer_id) === custId);
    console.log(`  Customer ${custId}:`);
    for (const s of subs) {
      console.log(`    sub=${s.sub_id} upsell=${Number(s.is_upsell_sub)} sku=${s.sku} product=${s.product_name}`);
    }
  }

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
