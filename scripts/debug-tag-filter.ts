/**
 * Debug: Compare subscription counts with different tag filters for Denmark
 * Date range: Jan 12 - Feb 9, 2026
 *
 * Run: npx tsx scripts/debug-tag-filter.ts
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

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = params.length > 0
    ? await pool.execute(sql, params)
    : await pool.query(sql);
  return rows as T[];
}

const START = '2026-01-12 00:00:00';
const END = '2026-02-09 23:59:59';

async function main() {
  console.log('=== Denmark subscription tag filter comparison ===');
  console.log(`Date range: ${START} to ${END}\n`);

  // 1. Total subscriptions (no tag filter)
  const [total] = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT s.id) as cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
  `, [START, END]);
  console.log(`1. Total subs (no filter):          ${total.cnt}`);

  // 2. With i.tag filter (original — trial invoice tag)
  const [iTag] = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT s.id) as cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log(`2. With i.tag filter:                ${iTag.cnt}`);

  // 3. With s.tag filter (new — subscription tag)
  const [sTag] = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT s.id) as cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log(`3. With s.tag filter:                ${sTag.cnt}`);

  // 4. Subs excluded ONLY by i.tag (have i.tag with parent-sub-id but s.tag doesn't)
  const [onlyITag] = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT s.id) as cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND NOT (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log(`4. Excluded by i.tag only:           ${onlyITag.cnt}`);

  // 5. Subs excluded ONLY by s.tag (have s.tag with parent-sub-id but i.tag doesn't)
  const [onlySTag] = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT s.id) as cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND NOT (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log(`5. Excluded by s.tag only:           ${onlySTag.cnt}`);

  // 6. Subs excluded by BOTH
  const [both] = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT s.id) as cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND NOT (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND NOT (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log(`6. Excluded by both:                 ${both.cnt}`);

  // 7. Sample s.tag values that contain parent-sub-id
  const sTagSamples = await query<{ id: number; sTag: string; iTag: string | null }>(`
    SELECT s.id, s.tag as sTag, GROUP_CONCAT(i.tag SEPARATOR ' | ') as iTag
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND s.tag LIKE '%parent-sub-id=%'
    GROUP BY s.id
    LIMIT 5
  `, [START, END]);
  console.log(`\n7. Sample subs with parent-sub-id in s.tag:`);
  for (const row of sTagSamples) {
    console.log(`   s.id=${row.id}  s.tag="${row.sTag}"  i.tag="${row.iTag}"`);
  }

  // 8. Sample i.tag values that contain parent-sub-id but s.tag doesn't
  const iTagOnlySamples = await query<{ id: number; sTag: string | null; iTag: string }>(`
    SELECT s.id, s.tag as sTag, GROUP_CONCAT(i.tag SEPARATOR ' | ') as iTag
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND NOT (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
    GROUP BY s.id
    LIMIT 5
  `, [START, END]);
  console.log(`\n8. Sample subs excluded by i.tag only (not s.tag):`);
  for (const row of iTagOnlySamples) {
    console.log(`   s.id=${row.id}  s.tag="${row.sTag}"  i.tag="${row.iTag}"`);
  }

  console.log('\n=== Summary ===');
  console.log(`Total: ${total.cnt}`);
  console.log(`i.tag excluded: ${Number(total.cnt) - Number(iTag.cnt)} → leaves ${iTag.cnt}`);
  console.log(`s.tag excluded: ${Number(total.cnt) - Number(sTag.cnt)} → leaves ${sTag.cnt}`);
  console.log(`Excluded by i.tag only: ${onlyITag.cnt}`);
  console.log(`Excluded by s.tag only: ${onlySTag.cnt}`);
  console.log(`Excluded by both: ${both.cnt}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});
