/**
 * Focused debug: Why does dashboard show 491 trials for Adwords under Denmark?
 * Jan 11 - Feb 11, 2026
 *
 * Tests:
 * 1. Standalone trial query with COALESCE (should be 503)
 * 2. Standalone trial query WITHOUT COALESCE (old code, should be 494)
 * 3. Subscription LEFT JOIN trial count (what displays if trial map lookup fails)
 * 4. Check for source casing variants that could cause trial map key collision
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
  console.log('=== Why does dashboard show 491 for Adwords? ===\n');

  // 1. Subscription LEFT JOIN trial count — this is what shows if trial map lookup FAILS
  // This simulates the exact subscription query the dashboard runs at depth=1
  const subLeftJoin = await query<{
    source: string | null;
    subscription_count: number;
    trial_count: number;
  }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT s.id) AS subscription_count,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count
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
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
    GROUP BY c.country, COALESCE(sr.source, sr_sub.source)
    ORDER BY subscription_count DESC
  `, [START, END, 'denmark']);

  console.log('1. SUBSCRIPTION LEFT JOIN trial count (fallback if trial map fails):');
  for (const row of subLeftJoin) {
    const marker = row.source?.toLowerCase() === 'adwords' ? ' <<' : '';
    console.log(`   ${row.source}: subs=${row.subscription_count}, trials=${row.trial_count}${marker}`);
  }

  // 2. Check source table for casing variants
  const sourceVariants = await query<{ id: number; source: string }>(`
    SELECT id, source FROM source WHERE LOWER(source) LIKE '%adword%' OR LOWER(source) LIKE '%google%'
  `);
  console.log('\n2. SOURCE TABLE entries for adwords/google:');
  for (const row of sourceVariants) {
    console.log(`   id=${row.id}: '${row.source}'`);
  }

  // 3. Check: are there trials with different source casing in the date range?
  const sourceCasing = await query<{ source_id: number | null; source_name: string | null; cnt: number }>(`
    SELECT i.source_id, sr.source AS source_name, COUNT(DISTINCT i.id) AS cnt
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND LOWER(c.country) = 'denmark'
      AND LOWER(sr.source) LIKE '%adword%'
    GROUP BY i.source_id, sr.source
  `, [START, END]);
  console.log('\n3. Trial source_id/name variants for Adwords in Denmark:');
  for (const row of sourceCasing) {
    console.log(`   source_id=${row.source_id}, name='${row.source_name}': ${row.cnt} trials`);
  }

  // 4. Standalone trial query — OLD code (sr.source only, no COALESCE)
  const trialOld = await query<{ source: string | null; trial_count: number }>(`
    SELECT
      sr.source,
      COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND c.country = ?
    GROUP BY c.country, sr.source
    HAVING LOWER(sr.source) LIKE '%adword%'
  `, [START, END, 'denmark']);

  console.log('\n4. Standalone trial OLD (sr.source only):');
  for (const row of trialOld) {
    console.log(`   ${row.source}: ${row.trial_count}`);
  }

  // 5. Standalone trial query — NEW code (COALESCE)
  const trialNew = await query<{ source: string | null; trial_count: number }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT i.id) AS trial_count
    FROM invoice i
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) as product_id
      FROM invoice_product
      GROUP BY invoice_id
    ) ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN subscription s ON i.subscription_id = s.id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND c.country = ?
    GROUP BY c.country, COALESCE(sr.source, sr_sub.source)
    HAVING LOWER(COALESCE(sr.source, sr_sub.source)) LIKE '%adword%'
  `, [START, END, 'denmark']);

  console.log('\n5. Standalone trial NEW (COALESCE):');
  for (const row of trialNew) {
    console.log(`   ${row.source}: ${row.trial_count}`);
  }

  // 6. Key question: what is 491?
  // Could it be the subscription LEFT JOIN count from OLD code (without COALESCE source)?
  const subOldSource = await query<{ source: string | null; trial_count: number }>(`
    SELECT
      sr_sub.source AS source,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
    GROUP BY sr_sub.source
    HAVING LOWER(sr_sub.source) LIKE '%adword%'
  `, [START, END, 'denmark']);

  console.log('\n6. Subscription LEFT JOIN trials grouped by sr_sub.source (sub source only):');
  for (const row of subOldSource) {
    console.log(`   ${row.source}: trials=${row.trial_count}`);
  }

  // 7. What about grouping by sr.source (invoice source) in subscription query?
  const subInvSource = await query<{ source: string | null; subscription_count: number; trial_count: number }>(`
    SELECT
      sr.source AS source,
      COUNT(DISTINCT s.id) AS subscription_count,
      COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND c.country = ?
    GROUP BY sr.source
    ORDER BY subscription_count DESC
    LIMIT 10
  `, [START, END, 'denmark']);

  console.log('\n7. Subscription LEFT JOIN grouped by sr.source (invoice source):');
  for (const row of subInvSource) {
    console.log(`   ${row.source}: subs=${row.subscription_count}, trials=${row.trial_count}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
