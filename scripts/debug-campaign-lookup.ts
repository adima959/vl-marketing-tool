/**
 * Look up campaign name → campaign ID mappings in marketing_merged_ads_spending
 * for the non-numeric tracking_id_4 values found in MariaDB.
 *
 * Run: npx tsx scripts/debug-campaign-lookup.ts
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
  // The specific non-numeric campaign names from the diagnostic (in our date range)
  const badValues = [
    'Balansera_Dnk_IM_v4withOP_21_11',
    'Balansera_Dnk_Aff_v4withOP_21_11',
    '{campaignid}',
  ];

  console.log('=== 1. Count affected subs in MariaDB (all time) ===\n');

  for (const val of badValues) {
    const [row] = await mq<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM subscription WHERE tracking_id_4 = ?',
      [val],
    );
    console.log(`  "${val}": ${row.cnt} subs`);
  }

  // Also count the literal string "null" in tracking_id_2
  const [nullT2] = await mq<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM subscription WHERE tracking_id_2 = 'null'",
  );
  console.log(`  tracking_id_2 = "null" (literal string): ${nullT2.cnt} subs`);

  console.log('\n=== 2. Search marketing_merged_ads_spending for these campaign names ===\n');

  // Exact match by campaign_name
  for (const val of badValues) {
    if (val === '{campaignid}') continue;

    const exact = await pq<{ campaign_id: string; campaign_name: string; network: string; min_date: string; max_date: string }>(`
      SELECT campaign_id::text AS campaign_id, campaign_name, network,
             MIN(date::date)::text AS min_date, MAX(date::date)::text AS max_date
      FROM marketing_merged_ads_spending
      WHERE campaign_name = $1
      GROUP BY campaign_id, campaign_name, network
    `, [val]);

    if (exact.length > 0) {
      console.log(`  "${val}" → EXACT MATCH in marketing_merged_ads_spending:`);
      for (const r of exact) {
        console.log(`    campaign_id=${r.campaign_id}, network=${r.network}, dates=${r.min_date} to ${r.max_date}`);
      }
    } else {
      console.log(`  "${val}" → No exact match by campaign_name`);
    }
  }

  // Broader search: all "Balansera_Dnk" campaigns
  console.log('\n=== 3. All "Balansera_Dnk" campaigns in marketing_merged_ads_spending ===\n');

  const balansera = await pq<{ campaign_id: string; campaign_name: string; network: string; impressions: string }>(`
    SELECT campaign_id::text AS campaign_id, campaign_name, network,
           SUM(impressions::integer) AS impressions
    FROM marketing_merged_ads_spending
    WHERE campaign_name ILIKE 'Balansera_Dnk%'
    GROUP BY campaign_id, campaign_name, network
    ORDER BY SUM(impressions::integer) DESC
  `);

  for (const r of balansera) {
    console.log(`  ${r.campaign_id} | "${r.campaign_name}" | ${r.network} | ${Number(r.impressions).toLocaleString()} impr`);
  }

  // 4. Check MariaDB: are there subs with the SAME campaign but numeric IDs?
  console.log('\n=== 4. MariaDB subs with tracking_id_4 containing "Balansera_Dnk_IM" (all formats) ===\n');

  const mariaBalansera = await mq<{ tracking_id_4: string; cnt: number }>(`
    SELECT tracking_id_4, COUNT(*) AS cnt
    FROM subscription
    WHERE tracking_id_4 LIKE 'Balansera_Dnk_IM%'
       OR tracking_id_4 LIKE 'Balansera_Dnk_Aff%'
    GROUP BY tracking_id_4
    ORDER BY cnt DESC
  `);

  for (const r of mariaBalansera) {
    console.log(`  "${r.tracking_id_4}": ${r.cnt} subs`);
  }

  // 5. Check: what adset IDs do subs with campaign "23291867037" have?
  console.log('\n=== 5. Adset IDs for campaign 23291867037 (Balansera_Dnk_IM_24_11) in MariaDB ===\n');

  const adsets = await mq<{ tracking_id_2: string | null; cnt: number }>(`
    SELECT tracking_id_2, COUNT(*) AS cnt
    FROM subscription
    WHERE tracking_id_4 = '23291867037'
    GROUP BY tracking_id_2
    ORDER BY cnt DESC
    LIMIT 20
  `);

  for (const r of adsets) {
    console.log(`  tracking_id_2="${r.tracking_id_2}": ${r.cnt} subs`);
  }

  // And what adset IDs do the "Balansera_Dnk_IM_v4withOP_21_11" subs have?
  console.log('\n=== 6. Adset IDs for "Balansera_Dnk_IM_v4withOP_21_11" subs in MariaDB ===\n');

  const adsetsBad = await mq<{ tracking_id_2: string | null; cnt: number }>(`
    SELECT tracking_id_2, COUNT(*) AS cnt
    FROM subscription
    WHERE tracking_id_4 = 'Balansera_Dnk_IM_v4withOP_21_11'
    GROUP BY tracking_id_2
    ORDER BY cnt DESC
  `);

  for (const r of adsetsBad) {
    console.log(`  tracking_id_2="${r.tracking_id_2}": ${r.cnt} subs`);
  }

  await maria.end();
  await neon.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
