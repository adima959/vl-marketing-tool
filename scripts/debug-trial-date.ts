/**
 * Debug: Check different end dates to find which matches 836/491
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

async function checkRange(endDate: string): Promise<void> {
  // Subscription query (depth=0, Denmark)
  const subs = await query<{ cust: number; subs: number; trials_left: number }>(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS cust,
      COUNT(DISTINCT s.id) AS subs,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trials_left
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) LIKE '%denmark%'
  `, [START, endDate]);

  // Standalone trial (depth=0, Denmark)
  const trials = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
  `, [START, endDate]);

  // Adwords sub at depth=1
  const adSubs = await query<{ cust: number; subs: number }>(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS cust,
      COUNT(DISTINCT s.id) AS subs
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr_sub.source) IN ('adwords', 'google')
  `, [START, endDate]);

  // Adwords trial at depth=1 (old code: invoice source only)
  const adTrialsOld = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, endDate]);

  // Adwords trial (new code: COALESCE)
  const adTrialsNew = await query<{ trial_count: number }>(`
    SELECT COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN ('adwords', 'google')
  `, [START, endDate]);

  console.log(`End: ${endDate}`);
  console.log(`  DK: cust=${subs[0]?.cust}, subs=${subs[0]?.subs}, trials(override)=${trials[0]?.trial_count}`);
  console.log(`  Adwords: cust=${adSubs[0]?.cust}, subs=${adSubs[0]?.subs}, trials(old)=${adTrialsOld[0]?.trial_count}, trials(new)=${adTrialsNew[0]?.trial_count}`);
  console.log(`  Dashboard: DK cust=633 subs=961 trials=836, Adwords cust=328 subs=467 trials=491`);
  const dkMatch = Number(subs[0]?.cust) === 633 && Number(subs[0]?.subs) === 961;
  const adMatch = Number(adSubs[0]?.cust) === 328 && Number(adSubs[0]?.subs) === 467;
  console.log(`  DK subs match? ${dkMatch}  Adwords subs match? ${adMatch}`);
  if (dkMatch) console.log(`  >>> THIS IS THE CORRECT DATE RANGE <<<`);
  console.log('');
}

async function main(): Promise<void> {
  console.log('Testing different end dates to match dashboard numbers:\n');
  console.log('Dashboard: DK cust=633, subs=961, trials=836');
  console.log('Dashboard: Adwords cust=328, subs=467, trials=491\n');

  await checkRange('2026-02-11 23:59:59');
  await checkRange('2026-02-12 23:59:59');
  await checkRange('2026-02-13 23:59:59');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
