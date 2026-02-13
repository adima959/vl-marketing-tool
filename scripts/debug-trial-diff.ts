/**
 * Debug: Find the 1 missing trial (235 CRM vs 234 our query)
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pool = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectTimeout: 15000,
});

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = params.length > 0
    ? await pool.execute(sql, params)
    : await pool.query(sql);
  return rows as T[];
}

const START = '2026-01-26 00:00:00';
const END = '2026-02-11 23:59:59';
const SOURCES = ['adwords', 'google'];

async function main(): Promise<void> {
  // 1. Our dashboard query: type=1, deleted=0, source filter via i.source_id
  const dashTrials = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr.source) IN (?, ?)
  `, [START, END, ...SOURCES]);
  console.log(`Dashboard trial query (deleted=0, source on invoice): ${dashTrials[0]?.trial_count}`);

  // 2. Without deleted=0 filter
  const withDeleted = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr.source) IN (?, ?)
  `, [START, END, ...SOURCES]);
  console.log(`Without deleted filter: ${withDeleted[0]?.trial_count}`);

  // 3. Using subscription source instead of invoice source
  const subSource = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr_sub.source) IN (?, ?)
  `, [START, END, ...SOURCES]);
  console.log(`Using subscription source: ${subSource[0]?.trial_count}`);

  // 4. Using COALESCE(invoice source, sub source)
  const coalesced = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (?, ?)
  `, [START, END, ...SOURCES]);
  console.log(`Using COALESCE(inv source, sub source): ${coalesced[0]?.trial_count}`);

  // 5. No source filter at all (just Denmark trials)
  const noSource = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
  `, [START, END]);
  console.log(`No source filter (all Denmark): ${noSource[0]?.trial_count}`);

  // 6. Find trials that have sub source=adwords but invoice source is different/null
  const mismatched = await query<{
    invoice_id: number;
    inv_source: string | null;
    sub_source: string | null;
    order_date: string;
    deleted: number;
  }>(`
    SELECT
      i.id AS invoice_id,
      sr.source AS inv_source,
      sr_sub.source AS sub_source,
      i.order_date,
      i.deleted
    FROM invoice i
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr_sub.source) IN (?, ?)
      AND (sr.source IS NULL OR LOWER(sr.source) NOT IN (?, ?))
    LIMIT 10
  `, [START, END, ...SOURCES, ...SOURCES]);

  console.log(`\nTrials with sub_source=adwords but different invoice source:`);
  for (const row of mismatched) {
    console.log(`  inv=${row.invoice_id}: inv_src=${row.inv_source}, sub_src=${row.sub_source}, date=${row.order_date}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
