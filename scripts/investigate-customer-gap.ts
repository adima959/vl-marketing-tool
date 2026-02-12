/**
 * Investigation script: Why does Adwords customer count differ?
 * - CRM external: 78 customers
 * - Dashboard table: 87 customers
 * - Modal CSV export: 90 subscription records
 *
 * Filters: Denmark > Balansera > Balansera-dnk-x3-[166/996] > Adwords
 * Date range: Feb 1-11, 2026
 *
 * Run: npx tsx scripts/investigate-customer-gap.ts
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

  console.log('=== INVESTIGATION: Adwords Customer Gap (78 vs 87 vs 90) ===\n');

  // -----------------------------------------------------------------------
  // Query 1: Reproduce the dashboard's aggregated counts
  // This mirrors exactly what crmQueryBuilder.buildQuery() generates for
  // geography mode at depth=3 (source) with parent filters
  // -----------------------------------------------------------------------
  console.log('--- Query 1: Dashboard aggregate (geography mode, source depth) ---');
  const dashboardAgg = await query(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
      COUNT(DISTINCT s.id) AS subscription_count,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count,
      COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS trials_approved_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
      AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND COALESCE(pg.group_name, pg_sub.group_name) = ?
      AND COALESCE(p.product_name, p_sub.product_name) = ?
    GROUP BY COALESCE(sr.source, sr_sub.source)
    ORDER BY subscription_count DESC
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.table(dashboardAgg);

  // -----------------------------------------------------------------------
  // Query 2: List individual customers counted as "Adwords" in dashboard
  // Same JOINs + filters, but return individual customer IDs
  // -----------------------------------------------------------------------
  console.log('\n--- Query 2: Individual customers attributed to Adwords ---');
  const adwordsCustomers = await query(`
    SELECT DISTINCT
      s.customer_id,
      c.first_name,
      c.last_name,
      c.date_registered,
      s.date_create AS sub_date_create,
      s.id AS subscription_id,
      s.deleted AS sub_deleted,
      s.status AS sub_status,
      COALESCE(sr.source, sr_sub.source) AS resolved_source,
      sr.source AS invoice_source,
      sr_sub.source AS subscription_source
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND COALESCE(pg.group_name, pg_sub.group_name) = ?
      AND COALESCE(p.product_name, p_sub.product_name) = ?
      AND COALESCE(sr.source, sr_sub.source) = 'adwords'
      AND DATE(c.date_registered) = DATE(s.date_create)
    ORDER BY s.date_create
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`Total customer records: ${adwordsCustomers.length}`);
  console.log(`Distinct customer IDs: ${new Set(adwordsCustomers.map((r: any) => r.customer_id)).size}`);
  console.table(adwordsCustomers.map((r: any) => ({
    customer_id: r.customer_id,
    name: `${r.first_name} ${r.last_name}`,
    registered: r.date_registered,
    sub_created: r.sub_date_create,
    sub_id: r.subscription_id,
    deleted: r.sub_deleted,
    status: r.sub_status,
    resolved_src: r.resolved_source,
    inv_src: r.invoice_source,
    sub_src: r.subscription_source,
  })));

  // -----------------------------------------------------------------------
  // Query 3: Check for deleted subscriptions in the set
  // Dashboard geography mode does NOT filter s.deleted = 0
  // -----------------------------------------------------------------------
  console.log('\n--- Query 3: Deleted subscription breakdown ---');
  const deletedBreakdown = await query(`
    SELECT
      s.deleted,
      COUNT(DISTINCT s.id) AS sub_count,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND COALESCE(pg.group_name, pg_sub.group_name) = ?
      AND COALESCE(p.product_name, p_sub.product_name) = ?
      AND COALESCE(sr.source, sr_sub.source) = 'adwords'
    GROUP BY s.deleted
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.table(deletedBreakdown);

  // -----------------------------------------------------------------------
  // Query 4: Check source resolution — invoice source vs subscription source
  // Find subscriptions where COALESCE picks different sources
  // -----------------------------------------------------------------------
  console.log('\n--- Query 4: Source resolution mismatches ---');
  const sourceMismatch = await query(`
    SELECT
      s.id AS subscription_id,
      s.customer_id,
      c.first_name,
      c.last_name,
      sr.source AS invoice_source,
      sr_sub.source AS subscription_source,
      COALESCE(sr.source, sr_sub.source) AS resolved_source
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND COALESCE(pg.group_name, pg_sub.group_name) = ?
      AND COALESCE(p.product_name, p_sub.product_name) = ?
      AND COALESCE(sr.source, sr_sub.source) = 'adwords'
      AND (sr.source IS NULL OR sr.source != sr_sub.source)
    ORDER BY s.date_create
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`Subscriptions with source mismatch/fallback: ${sourceMismatch.length}`);
  if (sourceMismatch.length > 0) {
    console.table(sourceMismatch.map((r: any) => ({
      sub_id: r.subscription_id,
      customer_id: r.customer_id,
      name: `${r.first_name} ${r.last_name}`,
      inv_src: r.invoice_source,
      sub_src: r.subscription_source,
      resolved: r.resolved_source,
    })));
  }

  // -----------------------------------------------------------------------
  // Query 5: All subscriptions for this product/country in date range
  // Show ALL sources to check if some customers appear under multiple sources
  // -----------------------------------------------------------------------
  console.log('\n--- Query 5: All subscription records (all sources) for these filters ---');
  const allSubs = await query(`
    SELECT
      s.id AS subscription_id,
      s.customer_id,
      c.first_name,
      c.last_name,
      DATE(c.date_registered) AS date_registered,
      DATE(s.date_create) AS date_create,
      s.deleted,
      s.status,
      COALESCE(sr.source, sr_sub.source) AS resolved_source,
      sr.source AS invoice_source,
      sr_sub.source AS subscription_source,
      DATE(c.date_registered) = DATE(s.date_create) AS is_new_customer
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND COALESCE(pg.group_name, pg_sub.group_name) = ?
      AND COALESCE(p.product_name, p_sub.product_name) = ?
    ORDER BY COALESCE(sr.source, sr_sub.source), s.date_create
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`Total subscription records: ${allSubs.length}`);

  // Group by resolved source
  const bySource: Record<string, any[]> = {};
  for (const row of allSubs) {
    const src = (row as any).resolved_source || '(null)';
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(row);
  }
  for (const [src, rows] of Object.entries(bySource)) {
    const customerIds = new Set(rows.map((r: any) => r.customer_id));
    const newCustomerIds = new Set(rows.filter((r: any) => r.is_new_customer).map((r: any) => r.customer_id));
    console.log(`  ${src}: ${rows.length} subs, ${customerIds.size} unique customers, ${newCustomerIds.size} new customers`);
  }

  // -----------------------------------------------------------------------
  // Query 6: Find customers that appear under MULTIPLE sources
  // These would be counted once per source in the dashboard
  // -----------------------------------------------------------------------
  console.log('\n--- Query 6: Customers appearing under multiple sources ---');
  const multiSource = await query(`
    SELECT
      s.customer_id,
      c.first_name,
      c.last_name,
      GROUP_CONCAT(DISTINCT COALESCE(sr.source, sr_sub.source) ORDER BY COALESCE(sr.source, sr_sub.source)) AS sources,
      COUNT(DISTINCT COALESCE(sr.source, sr_sub.source)) AS source_count,
      COUNT(DISTINCT s.id) AS sub_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND COALESCE(pg.group_name, pg_sub.group_name) = ?
      AND COALESCE(p.product_name, p_sub.product_name) = ?
      AND DATE(c.date_registered) = DATE(s.date_create)
    GROUP BY s.customer_id, c.first_name, c.last_name
    HAVING COUNT(DISTINCT COALESCE(sr.source, sr_sub.source)) > 1
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`Customers in multiple source groups: ${multiSource.length}`);
  if (multiSource.length > 0) {
    console.table(multiSource);
  }

  // -----------------------------------------------------------------------
  // Query 7: What does the CRM detail modal actually return for "customers"?
  // The modal uses a different query builder (crmDetailModalQueryBuilder)
  // that returns individual customer records
  // -----------------------------------------------------------------------
  console.log('\n--- Query 7: CRM external comparison — new customers only ---');
  // The CRM external system likely shows customers where date_registered = date_create
  // AND the subscription is not deleted. Let's check with deleted = 0.
  const newCustomersNotDeleted = await query(`
    SELECT DISTINCT
      s.customer_id,
      c.first_name,
      c.last_name,
      DATE(c.date_registered) AS date_registered,
      DATE(s.date_create) AS date_create,
      s.deleted,
      s.status
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND COALESCE(pg.group_name, pg_sub.group_name) = ?
      AND COALESCE(p.product_name, p_sub.product_name) = ?
      AND COALESCE(sr.source, sr_sub.source) = 'adwords'
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND s.deleted = 0
    ORDER BY s.date_create
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`New customers (not deleted): ${newCustomersNotDeleted.length}`);

  // Also try without deleted filter
  const newCustomersAll = await query(`
    SELECT DISTINCT
      s.customer_id,
      c.first_name,
      c.last_name,
      DATE(c.date_registered) AS date_registered,
      DATE(s.date_create) AS date_create,
      s.deleted,
      s.status
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND COALESCE(pg.group_name, pg_sub.group_name) = ?
      AND COALESCE(p.product_name, p_sub.product_name) = ?
      AND COALESCE(sr.source, sr_sub.source) = 'adwords'
      AND DATE(c.date_registered) = DATE(s.date_create)
    ORDER BY s.date_create
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`New customers (including deleted subs): ${newCustomersAll.length}`);

  // Show deleted customers
  const deletedCustomers = newCustomersAll.filter((r: any) => r.deleted === 1);
  if (deletedCustomers.length > 0) {
    console.log(`\nCustomers with deleted subscriptions (${deletedCustomers.length}):`);
    console.table(deletedCustomers.map((r: any) => ({
      customer_id: r.customer_id,
      name: `${r.first_name} ${r.last_name}`,
      registered: r.date_registered,
      sub_created: r.date_create,
      deleted: r.deleted,
      status: r.status,
    })));
  }

  // -----------------------------------------------------------------------
  // Query 8: Check customers where registration date != subscription date
  // These are NOT counted in customer_count but ARE in the CSV/modal
  // -----------------------------------------------------------------------
  console.log('\n--- Query 8: Adwords subs where registration date != subscription date ---');
  const notNewCustomers = await query(`
    SELECT
      s.id AS subscription_id,
      s.customer_id,
      c.first_name,
      c.last_name,
      DATE(c.date_registered) AS date_registered,
      DATE(s.date_create) AS date_create,
      s.deleted,
      s.status,
      COALESCE(sr.source, sr_sub.source) AS resolved_source
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
      AND COALESCE(pg.group_name, pg_sub.group_name) = ?
      AND COALESCE(p.product_name, p_sub.product_name) = ?
      AND COALESCE(sr.source, sr_sub.source) = 'adwords'
      AND DATE(c.date_registered) != DATE(s.date_create)
    ORDER BY s.date_create
  `, [startDate, endDate, 'Denmark', 'Balansera', 'Balansera-dnk-x3-[166/996]']);
  console.log(`Adwords subs with existing customers (reg != create): ${notNewCustomers.length}`);
  if (notNewCustomers.length > 0) {
    console.table(notNewCustomers.map((r: any) => ({
      sub_id: r.subscription_id,
      customer_id: r.customer_id,
      name: `${r.first_name} ${r.last_name}`,
      registered: r.date_registered,
      sub_created: r.date_create,
      deleted: r.deleted,
      status: r.status,
    })));
  }

  await pool.end();
  console.log('\n=== Investigation complete ===');
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
