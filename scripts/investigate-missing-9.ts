/**
 * Investigate the 10 customers in dashboard but not in CRM external.
 * Run: npx tsx scripts/investigate-missing-9.ts
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
  const missingIds = [267741, 267742, 267753, 267760, 267764, 267776, 267779, 267786, 267816, 267990];

  // Single query: full details for all 10 missing customers
  console.log('=== All 10 missing customers — full details ===\n');
  const details = await query(`
    SELECT
      s.customer_id,
      c.first_name,
      c.last_name,
      s.id AS sub_id,
      s.status AS sub_status,
      s.deleted AS sub_deleted,
      DATE(c.date_registered) AS date_registered,
      DATE(s.date_create) AS date_create,
      p_sub.product_name AS sub_product,
      pg_sub.group_name AS sub_product_group,
      sr_sub.source AS sub_source,
      i.id AS invoice_id,
      i.deleted AS invoice_deleted,
      i.is_marked AS invoice_approved,
      sr_inv.source AS invoice_source,
      ip_p.product_name AS invoice_product,
      ip_pg.group_name AS invoice_product_group,
      COALESCE(ip_pg.group_name, pg_sub.group_name) AS resolved_product_group,
      COALESCE(ip_p.product_name, p_sub.product_name) AS resolved_product,
      COALESCE(sr_inv.source, sr_sub.source) AS resolved_source
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN source sr_inv ON sr_inv.id = i.source_id
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product ip_p ON ip_p.id = ip.product_id
    LEFT JOIN product_group ip_pg ON ip_pg.id = ip_p.product_group_id
    WHERE s.customer_id IN (267741, 267742, 267753, 267760, 267764, 267776, 267779, 267786, 267816, 267990)
      AND s.date_create BETWEEN '2026-02-01 00:00:00' AND '2026-02-11 23:59:59'
    ORDER BY s.customer_id, s.date_create
  `);

  console.table(details.map((r: any) => ({
    cust_id: r.customer_id,
    name: `${r.first_name} ${r.last_name}`.trim(),
    sub_id: r.sub_id,
    status: r.sub_status,
    del: r.sub_deleted,
    reg: r.date_registered,
    created: r.date_create,
    sub_prod: r.sub_product,
    sub_pg: r.sub_product_group,
    sub_src: r.sub_source,
    inv_id: r.invoice_id,
    inv_del: r.invoice_deleted,
    inv_appr: r.invoice_approved,
    inv_src: r.invoice_source,
    inv_prod: r.invoice_product,
    inv_pg: r.invoice_product_group,
    res_pg: r.resolved_product_group,
    res_prod: r.resolved_product,
    res_src: r.resolved_source,
  })));

  // Compare: a customer that IS in both lists
  console.log('\n=== Control: Customer 267769 (Anja Mathiesen) — IN both lists ===');
  const control = await query(`
    SELECT
      s.customer_id,
      c.first_name,
      c.last_name,
      s.id AS sub_id,
      s.status AS sub_status,
      s.deleted AS sub_deleted,
      DATE(c.date_registered) AS date_registered,
      DATE(s.date_create) AS date_create,
      p_sub.product_name AS sub_product,
      pg_sub.group_name AS sub_product_group,
      sr_sub.source AS sub_source,
      i.id AS invoice_id,
      i.deleted AS invoice_deleted,
      i.is_marked AS invoice_approved,
      sr_inv.source AS invoice_source,
      ip_p.product_name AS invoice_product,
      ip_pg.group_name AS invoice_product_group,
      COALESCE(ip_pg.group_name, pg_sub.group_name) AS resolved_product_group,
      COALESCE(ip_p.product_name, p_sub.product_name) AS resolved_product
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN source sr_inv ON sr_inv.id = i.source_id
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product ip_p ON ip_p.id = ip.product_id
    LEFT JOIN product_group ip_pg ON ip_pg.id = ip_p.product_group_id
    WHERE s.customer_id = 267769
      AND s.date_create BETWEEN '2026-02-01 00:00:00' AND '2026-02-11 23:59:59'
  `);
  console.table(control.map((r: any) => ({
    cust_id: r.customer_id,
    name: `${r.first_name} ${r.last_name}`.trim(),
    sub_id: r.sub_id,
    status: r.sub_status,
    del: r.sub_deleted,
    sub_prod: r.sub_product,
    sub_pg: r.sub_product_group,
    sub_src: r.sub_source,
    inv_id: r.invoice_id,
    inv_del: r.invoice_deleted,
    inv_prod: r.invoice_product,
    inv_pg: r.invoice_product_group,
    res_pg: r.resolved_product_group,
    res_prod: r.resolved_product,
  })));

  await pool.end();
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
