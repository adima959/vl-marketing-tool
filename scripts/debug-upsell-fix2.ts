/**
 * Verify: trial query with full upsell exclusion in WHERE clause
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
  console.log('=== Verify full upsell exclusion (WHERE clause) ===\n');

  // Trial query with upsell exclusion in WHERE (matches new code)
  const trialFixed = await query<{ source: string | null; trial_count: number; trials_approved: number }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT i.id) AS trial_count,
      COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS trials_approved
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
    GROUP BY COALESCE(sr.source, sr_sub.source)
    ORDER BY trial_count DESC
  `, [START, END]);

  // Subscription query for comparison
  const subs = await query<{ source: string | null; subscription_count: number }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT s.id) AS subscription_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
    GROUP BY COALESCE(sr.source, sr_sub.source)
    ORDER BY subscription_count DESC
  `, [START, END]);

  const subMap = new Map<string, number>();
  for (const row of subs) {
    subMap.set(row.source?.toLowerCase() ?? 'null', Number(row.subscription_count));
  }

  console.log('Source             | Subs | Trials | Approved | Appr.%');
  console.log('-------------------|------|--------|----------|-------');
  let totalSubs = 0, totalTrials = 0, totalApproved = 0;
  for (const row of trialFixed) {
    const src = row.source ?? 'null';
    const subCount = subMap.get(src.toLowerCase()) ?? 0;
    const trials = Number(row.trial_count);
    const approved = Number(row.trials_approved);
    const rate = subCount > 0 ? ((approved / subCount) * 100).toFixed(0) : 'N/A';
    const warn = approved > subCount ? ' ⚠️' : '';
    console.log(`${src.padEnd(19)}| ${String(subCount).padEnd(5)}| ${String(trials).padEnd(7)}| ${String(approved).padEnd(9)}| ${rate}%${warn}`);
    totalSubs += subCount;
    totalTrials += trials;
    totalApproved += approved;
  }
  console.log('-------------------|------|--------|----------|-------');
  const totalRate = totalSubs > 0 ? ((totalApproved / totalSubs) * 100).toFixed(0) : 'N/A';
  console.log(`${'TOTAL'.padEnd(19)}| ${String(totalSubs).padEnd(5)}| ${String(totalTrials).padEnd(7)}| ${String(totalApproved).padEnd(9)}| ${totalRate}%`);

  const anyOver100 = trialFixed.some(r => {
    const subCount = subMap.get((r.source?.toLowerCase()) ?? 'null') ?? 0;
    return Number(r.trials_approved) > subCount;
  });
  console.log(anyOver100 ? '\n⚠️ Some sources still have approval > 100%!' : '\n✅ All sources have approval ≤ 100%');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
