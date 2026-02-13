/**
 * Debug: Why dashboard shows 491 trials instead of 503
 * Check old vs new trial query for Jan 11 - Feb 11
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
  // OLD code: invoice source only (sr.source), grouped by sr.source
  const oldTrials = await query<{ source: string | null; trial_count: number }>(`
    SELECT
      sr.source,
      COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) LIKE '%denmark%'
    GROUP BY sr.source
    ORDER BY trial_count DESC
  `, [START, END]);

  console.log('OLD trial query (invoice source only, no COALESCE):');
  let oldTotal = 0;
  for (const row of oldTrials) {
    if (row.source && ['adwords', 'google'].includes(row.source.toLowerCase())) {
      console.log(`  >> ${row.source}: ${row.trial_count} <<`);
    } else {
      console.log(`     ${row.source}: ${row.trial_count}`);
    }
    oldTotal += Number(row.trial_count);
  }
  const oldAdwords = oldTrials.filter(r => r.source && ['adwords', 'google'].includes(r.source.toLowerCase()))
    .reduce((sum, r) => sum + Number(r.trial_count), 0);
  console.log(`  Adwords+Google total: ${oldAdwords}`);
  console.log(`  ALL sources total: ${oldTotal}`);

  // NEW code: COALESCE(sr.source, sr_sub.source), grouped by COALESCE
  const newTrials = await query<{ source: string | null; trial_count: number }>(`
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
      AND LOWER(c.country) LIKE '%denmark%'
    GROUP BY COALESCE(sr.source, sr_sub.source)
    ORDER BY trial_count DESC
  `, [START, END]);

  console.log('\nNEW trial query (COALESCE source):');
  let newTotal = 0;
  for (const row of newTrials) {
    if (row.source && ['adwords', 'google'].includes(row.source.toLowerCase())) {
      console.log(`  >> ${row.source}: ${row.trial_count} <<`);
    } else {
      console.log(`     ${row.source}: ${row.trial_count}`);
    }
    newTotal += Number(row.trial_count);
  }
  const newAdwords = newTrials.filter(r => r.source && ['adwords', 'google'].includes(r.source.toLowerCase()))
    .reduce((sum, r) => sum + Number(r.trial_count), 0);
  console.log(`  Adwords+Google total: ${newAdwords}`);
  console.log(`  ALL sources total: ${newTotal}`);

  console.log(`\nDIFF: old=${oldAdwords}, new=${newAdwords}, delta=${newAdwords - oldAdwords}`);
  console.log(`Dashboard shows: 491`);
  console.log(`Old code matches 491? ${oldAdwords === 491 ? 'YES' : 'NO'}`);
  console.log(`New code matches 503? ${newAdwords === 503 ? 'YES' : 'NO'}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
