/**
 * Debug: Simulate exact dashboard trial queries at depth=0 and depth=1
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

const START = '2026-01-11 00:00:00';
const END = '2026-02-11 23:59:59';

async function main(): Promise<void> {
  console.log('=== Simulating dashboard trial queries ===\n');

  // DEPTH=0: Trial query grouped by country, no parent filter
  // This is what the dashboard shows for the Denmark row
  const depth0 = await query<{ country: string; trial_count: number; trials_approved: number }>(`
    SELECT
      c.country,
      COUNT(DISTINCT i.id) AS trial_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS trials_approved
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
    GROUP BY c.country
    HAVING LOWER(c.country) LIKE '%denmark%'
  `, [START, END]);

  console.log('DEPTH=0 (country level, OLD code no COALESCE):');
  console.log(`  Denmark trials: ${depth0[0]?.trial_count} (dashboard shows 836)`);

  // DEPTH=0 with new COALESCE JOINs
  const depth0New = await query<{ country: string; trial_count: number }>(`
    SELECT
      c.country,
      COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
    GROUP BY c.country
    HAVING LOWER(c.country) LIKE '%denmark%'
  `, [START, END]);

  console.log(`  With COALESCE JOINs: ${depth0New[0]?.trial_count}`);

  // DEPTH=1: Trial query grouped by source, parent filter = country is denmark
  // OLD code: groups by sr.source, parent filter uses sr.source for source column
  const depth1Old = await query<{ source: string | null; trial_count: number }>(`
    SELECT
      sr.source,
      COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) = ?
    GROUP BY sr.source
    ORDER BY trial_count DESC
  `, [START, END, 'denmark']);

  console.log('\nDEPTH=1 OLD (grouped by sr.source, parent country=denmark):');
  let oldSum = 0;
  for (const row of depth1Old) {
    const marker = row.source?.toLowerCase() === 'adwords' ? ' <<' : '';
    console.log(`  ${row.source}: ${row.trial_count}${marker}`);
    oldSum += Number(row.trial_count);
  }
  console.log(`  SUM: ${oldSum}`);

  // DEPTH=1 with COALESCE
  const depth1New = await query<{ source: string | null; trial_count: number }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) = ?
    GROUP BY COALESCE(sr.source, sr_sub.source)
    ORDER BY trial_count DESC
  `, [START, END, 'denmark']);

  console.log('\nDEPTH=1 NEW (grouped by COALESCE source, parent country=denmark):');
  let newSum = 0;
  for (const row of depth1New) {
    const marker = row.source?.toLowerCase() === 'adwords' ? ' <<' : '';
    console.log(`  ${row.source}: ${row.trial_count}${marker}`);
    newSum += Number(row.trial_count);
  }
  console.log(`  SUM: ${newSum}`);

  // Check: what does the sub query LEFT JOIN give for trials?
  // This is the FALLBACK when trial map lookup fails
  const subLeftJoin = await query<{ source: string | null; trial_count_left: number }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count_left
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = ?
    GROUP BY COALESCE(sr.source, sr_sub.source)
    ORDER BY trial_count_left DESC
  `, [START, END, 'denmark']);

  console.log('\nSUB QUERY LEFT JOIN TRIALS (fallback when trial map miss):');
  for (const row of subLeftJoin) {
    const marker = row.source?.toLowerCase() === 'adwords' ? ' <<' : '';
    console.log(`  ${row.source}: ${row.trial_count_left}${marker}`);
  }

  // Check LOWER vs LIKE for country filter
  const likeFilter = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr.source) = 'adwords'
  `, [START, END]);

  const exactFilter = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) = 'denmark'
      AND LOWER(sr.source) = 'adwords'
  `, [START, END]);

  console.log(`\nCOUNTRY FILTER COMPARISON (Adwords only):`)
  console.log(`  LIKE '%denmark%': ${likeFilter[0]?.trial_count}`);
  console.log(`  = 'denmark': ${exactFilter[0]?.trial_count}`);

  // Check what country values exist
  const countries = await query<{ country: string; cnt: number }>(`
    SELECT c.country, COUNT(DISTINCT i.id) AS cnt
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr.source) = 'adwords'
    GROUP BY c.country
  `, [START, END]);

  console.log('\nCOUNTRY VALUES for Denmark + Adwords trials:');
  for (const row of countries) {
    console.log(`  '${row.country}': ${row.cnt}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
