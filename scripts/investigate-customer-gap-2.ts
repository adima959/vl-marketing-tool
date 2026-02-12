/**
 * Follow-up: Find customers counted in dashboard 87 that have deleted/missing invoices
 * Run: npx tsx scripts/investigate-customer-gap-2.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectTimeout: 15000,
});

async function query<T = Record<string, any>>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = params.length > 0
    ? await pool.execute(sql, params)
    : await pool.query(sql);
  return rows as T[];
}

async function main() {
  const startDate = '2026-02-01 00:00:00';
  const endDate = '2026-02-11 23:59:59';

  // -----------------------------------------------------------------------
  // Query A: For each of the 87 new Adwords customers, check invoice status
  // Join ALL invoices (including deleted) to see the real picture
  // -----------------------------------------------------------------------
  console.log('--- Query A: New Adwords customers with their invoice status ---');
  const customersWithInvoiceStatus = await query(`
    SELECT
      s.customer_id,
      c.first_name,
      c.last_name,
      s.id AS subscription_id,
      s.status AS sub_status,
      s.deleted AS sub_deleted,
      i_all.id AS invoice_id,
      i_all.type AS invoice_type,
      i_all.deleted AS invoice_deleted,
      i_all.is_marked AS invoice_approved,
      COALESCE(sr.source, sr_sub.source) AS resolved_source
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i_all ON i_all.subscription_id = s.id AND i_all.type = 1
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = COALESCE(i_all.id, s.id * -1)
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i_all.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = ?
      AND COALESCE(pg.group_name, pg_sub.group_name) = ?
      AND COALESCE(p.product_name, p_sub.product_name) = ?
      AND COALESCE(sr.source, sr_sub.source) = 'adwords'
      AND DATE(c.date_registered) = DATE(s.date_create)
    ORDER BY s.customer_id, i_all.id
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);

  // Group by customer
  const byCustomer: Record<number, any[]> = {};
  for (const row of customersWithInvoiceStatus) {
    const cid = (row as any).customer_id;
    if (!byCustomer[cid]) byCustomer[cid] = [];
    byCustomer[cid].push(row);
  }

  console.log(`\nCustomers with ALL invoices deleted or no invoices:`);
  let problemCount = 0;
  for (const [cid, rows] of Object.entries(byCustomer)) {
    const hasValidInvoice = rows.some((r: any) => r.invoice_id !== null && r.invoice_deleted === 0);
    const hasDeletedInvoice = rows.some((r: any) => r.invoice_id !== null && r.invoice_deleted === 1);
    const hasNoInvoice = rows.every((r: any) => r.invoice_id === null);

    if (!hasValidInvoice) {
      problemCount++;
      const r = rows[0] as any;
      console.log(`  ${r.first_name} ${r.last_name} (${cid}) — sub_status=${r.sub_status}, ` +
        `deleted_invoice=${hasDeletedInvoice}, no_invoice=${hasNoInvoice}, ` +
        `subs: ${rows.map((r: any) => r.subscription_id).join(',')}`);
    }
  }
  console.log(`\nTotal customers without valid (non-deleted) invoice: ${problemCount}`);
  console.log(`Total customers with valid invoice: ${Object.keys(byCustomer).length - problemCount}`);
  console.log(`Dashboard customer_count: ${Object.keys(byCustomer).length}`);

  // -----------------------------------------------------------------------
  // Query B: Simpler approach — use the product filter through subscription
  // path to avoid the complex invoice product join issue
  // -----------------------------------------------------------------------
  console.log('\n--- Query B: Direct check — new customers with valid vs deleted invoices ---');
  const directCheck = await query(`
    SELECT
      s.customer_id,
      c.first_name,
      c.last_name,
      s.id AS sub_id,
      s.status AS sub_status,
      (SELECT COUNT(*) FROM invoice iv
       WHERE iv.subscription_id = s.id AND iv.type = 1 AND iv.deleted = 0) AS valid_invoices,
      (SELECT COUNT(*) FROM invoice iv
       WHERE iv.subscription_id = s.id AND iv.type = 1 AND iv.deleted = 1) AS deleted_invoices,
      (SELECT COUNT(*) FROM invoice iv
       WHERE iv.subscription_id = s.id AND iv.type = 1) AS total_invoices,
      sr_sub.source AS sub_source
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = ?
      AND pg_sub.group_name = ?
      AND p_sub.product_name = ?
      AND sr_sub.source = 'Adwords'
      AND DATE(c.date_registered) = DATE(s.date_create)
    ORDER BY s.date_create
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);

  console.log(`\nTotal new Adwords customers (via subscription product path): ${new Set(directCheck.map((r: any) => r.customer_id)).size}`);

  const noValidInvoice = directCheck.filter((r: any) => r.valid_invoices === 0);
  console.log(`\nCustomers/subs with NO valid (non-deleted) trial invoice:`);
  console.table(noValidInvoice.map((r: any) => ({
    customer_id: r.customer_id,
    name: `${r.first_name} ${r.last_name}`,
    sub_id: r.sub_id,
    sub_status: r.sub_status,
    valid_invoices: r.valid_invoices,
    deleted_invoices: r.deleted_invoices,
    total_invoices: r.total_invoices,
  })));

  const onlyDeletedInvoice = directCheck.filter((r: any) => r.valid_invoices === 0 && r.deleted_invoices > 0);
  console.log(`\nCustomers with ONLY deleted invoices (invoice exists but deleted): ${onlyDeletedInvoice.length}`);
  if (onlyDeletedInvoice.length > 0) {
    console.table(onlyDeletedInvoice.map((r: any) => ({
      customer_id: r.customer_id,
      name: `${r.first_name} ${r.last_name}`,
      sub_id: r.sub_id,
      sub_status: r.sub_status,
      deleted_invoices: r.deleted_invoices,
    })));
  }

  // -----------------------------------------------------------------------
  // Query C: What if we exclude status=5 (Cancel Forever)?
  // -----------------------------------------------------------------------
  console.log('\n--- Query C: Customer count excluding Cancel Forever (status=5) ---');
  const excludingCancelled = await query(`
    SELECT
      COUNT(DISTINCT s.customer_id) AS customer_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = ?
      AND pg_sub.group_name = ?
      AND p_sub.product_name = ?
      AND sr_sub.source = 'Adwords'
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND s.status != 5
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`Customer count without Cancel Forever: ${(excludingCancelled[0] as any).customer_count}`);

  // -----------------------------------------------------------------------
  // Query D: What if we require a valid (non-deleted) invoice?
  // -----------------------------------------------------------------------
  console.log('\n--- Query D: Customer count requiring valid invoice ---');
  const requireValidInvoice = await query(`
    SELECT
      COUNT(DISTINCT s.customer_id) AS customer_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND pg_sub.group_name = ?
      AND p_sub.product_name = ?
      AND sr_sub.source = 'Adwords'
      AND DATE(c.date_registered) = DATE(s.date_create)
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`Customer count with INNER JOIN invoice: ${(requireValidInvoice[0] as any).customer_count}`);

  // -----------------------------------------------------------------------
  // Query E: Exclude Cancel Forever AND require valid invoice
  // -----------------------------------------------------------------------
  console.log('\n--- Query E: Exclude Cancel Forever + require valid invoice ---');
  const bothFilters = await query(`
    SELECT
      COUNT(DISTINCT s.customer_id) AS customer_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND pg_sub.group_name = ?
      AND p_sub.product_name = ?
      AND sr_sub.source = 'Adwords'
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND s.status != 5
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`Customer count (no Cancel Forever + valid invoice): ${(bothFilters[0] as any).customer_count}`);

  // -----------------------------------------------------------------------
  // Query F: Exclude deleted subs
  // -----------------------------------------------------------------------
  console.log('\n--- Query F: Customer count with s.deleted = 0 ---');
  const notDeletedSubs = await query(`
    SELECT
      COUNT(DISTINCT s.customer_id) AS customer_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND s.deleted = 0
      AND c.country = ?
      AND pg_sub.group_name = ?
      AND p_sub.product_name = ?
      AND sr_sub.source = 'Adwords'
      AND DATE(c.date_registered) = DATE(s.date_create)
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`Customer count with s.deleted=0: ${(notDeletedSubs[0] as any).customer_count}`);

  await pool.end();
  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
