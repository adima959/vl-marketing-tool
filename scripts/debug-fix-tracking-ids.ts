/**
 * Debug + Fix: Find CRM subscriptions with campaign NAMES instead of numeric IDs
 * in tracking_id_4, look up the correct campaign_id from marketing_merged_ads_spending,
 * and optionally update them.
 *
 * Run: npx tsx scripts/debug-fix-tracking-ids.ts
 */
import mysql from 'mysql2/promise';
import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const maria = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectTimeout: 30000,
});

const neon = new Pool({ connectionString: process.env.DATABASE_URL });

async function mq<T>(sql: string, p: unknown[] = []): Promise<T[]> {
  const [rows] = await maria.execute(sql, p);
  return rows as T[];
}

async function pq<T>(sql: string, p: unknown[] = []): Promise<T[]> {
  const { rows } = await neon.query(sql, p);
  return rows as T[];
}

async function main(): Promise<void> {
  console.log('=== Find non-numeric tracking_id_4 values ===\n');

  // 1. Find all distinct non-numeric tracking_id_4 values in subscription table
  const nonNumeric = await mq<{
    tracking_id_4: string;
    cnt: number;
  }>(`
    SELECT s.tracking_id_4, COUNT(*) AS cnt
    FROM subscription s
    WHERE s.tracking_id_4 IS NOT NULL
      AND s.tracking_id_4 != ''
      AND s.tracking_id_4 NOT REGEXP '^[0-9]+$'
    GROUP BY s.tracking_id_4
    ORDER BY cnt DESC
  `);

  console.log(`Non-numeric tracking_id_4 values (all time):`);
  let totalAffected = 0;
  for (const r of nonNumeric) {
    console.log(`  "${r.tracking_id_4}": ${r.cnt} subs`);
    totalAffected += r.cnt;
  }
  console.log(`  Total affected subs: ${totalAffected}\n`);

  // 2. For each non-numeric value, try to find a matching campaign in marketing data
  console.log('=== Looking up campaign IDs in marketing_merged_ads_spending ===\n');

  for (const r of nonNumeric) {
    const name = r.tracking_id_4;

    // Try exact name match
    const exact = await pq<{ campaign_id: string; campaign_name: string }>(`
      SELECT DISTINCT campaign_id::text AS campaign_id, campaign_name
      FROM marketing_merged_ads_spending
      WHERE campaign_name = $1
    `, [name]);

    if (exact.length > 0) {
      console.log(`  "${name}" → EXACT MATCH → campaign_id=${exact[0].campaign_id} ("${exact[0].campaign_name}")`);
      continue;
    }

    // Try fuzzy: strip version prefix and match base name
    const baseName = name
      .replace(/_v\d+withOP/, '')
      .replace(/_v\d+/, '');

    const fuzzy = await pq<{ campaign_id: string; campaign_name: string }>(`
      SELECT DISTINCT campaign_id::text AS campaign_id, campaign_name
      FROM marketing_merged_ads_spending
      WHERE campaign_name ILIKE $1
      LIMIT 5
    `, [`%${baseName}%`]);

    if (fuzzy.length > 0) {
      console.log(`  "${name}" → FUZZY MATCH (base: "${baseName}"):`);
      for (const f of fuzzy) {
        console.log(`    campaign_id=${f.campaign_id} ("${f.campaign_name}")`);
      }
    } else {
      console.log(`  "${name}" → NO MATCH (base: "${baseName}")`);
    }
  }

  // 3. Also check: tracking_id_2 = literal "null" string
  console.log('\n=== tracking_id_2 = literal "null" string ===\n');

  const nullString = await mq<{ cnt: number }>(`
    SELECT COUNT(*) AS cnt FROM subscription WHERE tracking_id_2 = 'null'
  `);
  console.log(`  Subs with tracking_id_2 = 'null': ${nullString[0].cnt}`);

  const nullStringT4 = await mq<{ cnt: number }>(`
    SELECT COUNT(*) AS cnt FROM subscription WHERE tracking_id_4 = '{campaignid}'
  `);
  console.log(`  Subs with tracking_id_4 = '{campaignid}': ${nullStringT4[0].cnt}`);

  // 4. Show some detail about the affected subs
  console.log('\n=== Sample affected subs (non-numeric tracking_id_4) ===\n');

  const samples = await mq<{
    id: number;
    date_create: string;
    tracking_id: string | null;
    tracking_id_2: string | null;
    tracking_id_4: string | null;
    source_id: number | null;
  }>(`
    SELECT s.id, s.date_create, s.tracking_id, s.tracking_id_2, s.tracking_id_4, s.source_id
    FROM subscription s
    WHERE s.tracking_id_4 IS NOT NULL
      AND s.tracking_id_4 != ''
      AND s.tracking_id_4 NOT REGEXP '^[0-9]+$'
    ORDER BY s.date_create DESC
    LIMIT 20
  `);

  for (const s of samples) {
    console.log(`  sub ${s.id} (${String(s.date_create).slice(0, 10)}): t4="${s.tracking_id_4}" t2="${s.tracking_id_2}" t1="${s.tracking_id}"`);
  }

  await maria.end();
  await neon.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
