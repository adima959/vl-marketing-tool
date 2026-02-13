/**
 * Debug: Check if 836 and 491 come from the subscription LEFT JOIN fallback
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
  // Subscription LEFT JOIN trial count for Denmark at depth=0
  const depth0Sub = await query<{ country: string; trial_count: number }>(`
    SELECT
      c.country,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
    GROUP BY c.country
    HAVING LOWER(c.country) LIKE '%denmark%'
  `, [START, END]);

  console.log('Depth=0 sub LEFT JOIN trial count for Denmark:');
  console.log(`  trial_count: ${depth0Sub[0]?.trial_count} (dashboard shows 836)`);
  console.log(`  Match? ${Number(depth0Sub[0]?.trial_count) === 836 ? 'YES!' : 'NO'}`);

  // Subscription LEFT JOIN trial count at depth=1 (source under Denmark)
  const depth1Sub = await query<{ source: string | null; trial_count: number }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) LIKE '%denmark%'
    GROUP BY COALESCE(sr.source, sr_sub.source)
    ORDER BY trial_count DESC
  `, [START, END]);

  console.log('\nDepth=1 sub LEFT JOIN trial count (source under Denmark):');
  for (const row of depth1Sub) {
    const marker = row.source?.toLowerCase() === 'adwords' ? ` (dashboard shows 491, match? ${Number(row.trial_count) === 491 ? 'YES!' : 'NO'})` : '';
    console.log(`  ${row.source}: ${row.trial_count}${marker}`);
  }

  // Standalone trial override for depth=0 (should be 863)
  const depth0Trial = await query<{ country: string; trial_count: number }>(`
    SELECT c.country, COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
    GROUP BY c.country
    HAVING LOWER(c.country) LIKE '%denmark%'
  `, [START, END]);

  console.log(`\nStandalone trial override at depth=0: ${depth0Trial[0]?.trial_count} (should be 863)`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
