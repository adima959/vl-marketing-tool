/**
 * Verify customer 267764 (Knud Erik Ulstrup) in detail
 * Run: npx tsx scripts/verify-267764.ts
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
  // Full subscription + invoice detail for customer 267764
  console.log('=== Customer 267764 — Full DB verification ===\n');

  const subs = await query(`
    SELECT
      s.id AS sub_id,
      DATE(s.date_create) AS date_create,
      s.status,
      s.deleted,
      p.product_name,
      pg.group_name AS product_group,
      sr.source
    FROM subscription s
    LEFT JOIN product p ON p.id = s.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.customer_id = 267764
    ORDER BY s.date_create
  `);
  console.log('Subscriptions:');
  console.table(subs);

  const invoices = await query(`
    SELECT
      i.id AS invoice_id,
      i.subscription_id AS sub_id,
      i.type,
      i.deleted,
      i.is_marked,
      i.tag,
      i.source_id,
      sr.source AS invoice_source,
      DATE(i.order_date) AS order_date
    FROM invoice i
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.subscription_id IN (317652, 317653)
    ORDER BY i.id
  `);
  console.log('Invoices:');
  console.table(invoices.map((r: any) => ({
    inv_id: r.invoice_id,
    sub_id: r.sub_id,
    type: r.type,
    deleted: r.deleted,
    approved: r.is_marked,
    source: r.invoice_source,
    order_date: r.order_date,
    tag: r.tag ? r.tag.substring(0, 120) : null,
  })));

  // Now check: does the dashboard query's upsell exclusion catch the Brainy invoice?
  console.log('\n=== Upsell exclusion test ===');
  const upsellCheck = await query(`
    SELECT
      i.id AS invoice_id,
      i.subscription_id,
      i.tag,
      (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%') AS passes_upsell_filter
    FROM invoice i
    WHERE i.subscription_id IN (317652, 317653)
      AND i.type = 1
      AND i.deleted = 0
  `);
  console.table(upsellCheck.map((r: any) => ({
    inv_id: r.invoice_id,
    sub_id: r.subscription_id,
    has_parent_sub_id: r.tag?.includes('parent-sub-id=') ?? false,
    passes_upsell_filter: r.passes_upsell_filter,
    tag_preview: r.tag ? r.tag.substring(0, 100) : null,
  })));

  // Simulate the exact dashboard query for this customer
  console.log('\n=== Dashboard query simulation for customer 267764 ===');
  const dashboardSim = await query(`
    SELECT
      s.id AS sub_id,
      s.customer_id,
      COALESCE(p.product_name, p_sub.product_name) AS resolved_product,
      COALESCE(pg.group_name, pg_sub.group_name) AS resolved_product_group,
      COALESCE(sr.source, sr_sub.source) AS resolved_source,
      i.id AS invoice_id,
      i.tag AS invoice_tag,
      (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%') AS passes_upsell_filter
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
    WHERE s.customer_id = 267764
      AND s.date_create BETWEEN '2026-02-01 00:00:00' AND '2026-02-11 23:59:59'
  `);
  console.log('All rows BEFORE WHERE upsell filter:');
  console.table(dashboardSim.map((r: any) => ({
    sub_id: r.sub_id,
    inv_id: r.invoice_id,
    product: r.resolved_product,
    product_group: r.resolved_product_group,
    source: r.resolved_source,
    passes_upsell: r.passes_upsell_filter,
    tag: r.invoice_tag ? r.invoice_tag.substring(0, 80) : null,
  })));

  // After applying upsell filter + product filter
  const afterFilter = await query(`
    SELECT
      s.id AS sub_id,
      s.customer_id,
      COALESCE(p.product_name, p_sub.product_name) AS resolved_product,
      COALESCE(pg.group_name, pg_sub.group_name) AS resolved_product_group,
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
    WHERE s.customer_id = 267764
      AND s.date_create BETWEEN '2026-02-01 00:00:00' AND '2026-02-11 23:59:59'
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = 'Denmark'
      AND COALESCE(pg.group_name, pg_sub.group_name) = 'Balansera'
      AND COALESCE(p.product_name, p_sub.product_name) = 'Balansera-DNK-x3-[166/996]'
  `);
  console.log('\nAfter upsell + product filter:');
  console.table(afterFilter.map((r: any) => ({
    sub_id: r.sub_id,
    customer_id: r.customer_id,
    product: r.resolved_product,
    product_group: r.resolved_product_group,
    source: r.resolved_source,
  })));
  console.log(`Rows remaining: ${afterFilter.length}`);
  console.log(`This customer IS counted in dashboard customer_count: ${afterFilter.length > 0 ? 'YES' : 'NO'}`);

  await pool.end();
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
