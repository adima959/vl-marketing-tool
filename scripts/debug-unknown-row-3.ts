/**
 * Debug: compare source-level CRM totals WITH and WITHOUT country filter.
 * The Unknown row uses fetchSourceCrmData which has NO country filter —
 * this might inflate the Unknown with non-DK subscriptions.
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

const START = '2026-02-02 00:00:00';
const END = '2026-02-09 23:59:59';

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = params.length > 0 ? await pool.execute(sql, params) : await pool.query(sql);
  return rows as T[];
}

async function main(): Promise<void> {
  console.log('=== Source-level CRM totals: with vs without country filter ===\n');

  // Without country filter (what fetchSourceCrmData currently does)
  const allCountries = await q<{ source: string; subs: number; customers: number }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT s.id) AS subs,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
    GROUP BY COALESCE(sr.source, sr_sub.source)
    ORDER BY subs DESC
  `, [START, END]);

  console.log('WITHOUT country filter (all countries):');
  let totalSubs = 0, totalCust = 0;
  for (const r of allCountries) {
    console.log(`  ${(r.source ?? 'NULL').padEnd(20)} subs=${String(r.subs).padStart(4)} customers=${r.customers}`);
    totalSubs += Number(r.subs);
    totalCust += Number(r.customers);
  }
  console.log(`  ${'TOTAL'.padEnd(20)} subs=${String(totalSubs).padStart(4)} customers=${totalCust}`);

  // With country filter (what it SHOULD do when parent filter is Denmark)
  const dkOnly = await q<{ source: string; subs: number; customers: number }>(`
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      COUNT(DISTINCT s.id) AS subs,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
    GROUP BY COALESCE(sr.source, sr_sub.source)
    ORDER BY subs DESC
  `, [START, END]);

  console.log('\nWITH country filter (Denmark only):');
  let dkSubs = 0, dkCust = 0;
  for (const r of dkOnly) {
    console.log(`  ${(r.source ?? 'NULL').padEnd(20)} subs=${String(r.subs).padStart(4)} customers=${r.customers}`);
    dkSubs += Number(r.subs);
    dkCust += Number(r.customers);
  }
  console.log(`  ${'TOTAL'.padEnd(20)} subs=${String(dkSubs).padStart(4)} customers=${dkCust}`);

  // The gap that inflates Unknown
  const adwordsSources = ['adwords', 'google'];
  const facebookSources = ['facebook', 'meta', 'fb'];
  const relevantSources = [...adwordsSources, ...facebookSources];

  const allRelevant = allCountries.filter(r => relevantSources.includes((r.source ?? '').toLowerCase()));
  const dkRelevant = dkOnly.filter(r => relevantSources.includes((r.source ?? '').toLowerCase()));

  const allRelevantSubs = allRelevant.reduce((s, r) => s + Number(r.subs), 0);
  const dkRelevantSubs = dkRelevant.reduce((s, r) => s + Number(r.subs), 0);
  const allRelevantCust = allRelevant.reduce((s, r) => s + Number(r.customers), 0);
  const dkRelevantCust = dkRelevant.reduce((s, r) => s + Number(r.customers), 0);

  console.log('\n=== Impact on Unknown row (adwords+facebook sources) ===');
  console.log(`  Source totals (no country):   ${allRelevantSubs} subs, ${allRelevantCust} customers`);
  console.log(`  Source totals (DK only):       ${dkRelevantSubs} subs, ${dkRelevantCust} customers`);
  console.log(`  Non-DK inflation:              ${allRelevantSubs - dkRelevantSubs} subs, ${allRelevantCust - dkRelevantCust} customers`);
  console.log(`\n  → The Unknown row likely includes ~${allRelevantSubs - dkRelevantSubs} non-DK subscriptions that shouldn't be there`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
