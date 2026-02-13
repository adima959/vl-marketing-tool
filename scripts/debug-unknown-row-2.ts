/**
 * Debug: check how many ads tuples have product classifications vs don't.
 * The Unknown row at the product dimension = CRM subs whose tracking IDs
 * match ads that have no product classification.
 */
import mysql from 'mysql2/promise';
import { neon } from '@neondatabase/serverless';
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

const sql = neon(process.env.DATABASE_URL!);

const START = '2026-02-02 00:00:00';
const END = '2026-02-09 23:59:59';
const PG_START = '2026-02-02';
const PG_END = '2026-02-09';
const SOURCES = ['adwords', 'google', 'facebook', 'meta', 'fb'];

function isValid(id: string | null): boolean {
  return id != null && id !== 'null' && id !== '';
}

async function mariaQuery<T>(query: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = params.length > 0 ? await pool.execute(query, params) : await pool.query(query);
  return rows as T[];
}

async function main(): Promise<void> {
  console.log(`=== Unknown Row Debug Part 2: Product Classification ===\n`);

  // 1. How many ads tuples have product classification vs not?
  const classified = await sql`
    SELECT
      CASE WHEN cc.product_id IS NOT NULL THEN 'classified' ELSE 'unclassified' END AS status,
      COUNT(DISTINCT (m.campaign_id, m.adset_id, m.ad_id)) AS tuple_count,
      ROUND(SUM(m.cost::numeric), 2) AS total_cost
    FROM merged_ads_spending m
    LEFT JOIN app_campaign_classifications cc
      ON m.campaign_id = cc.campaign_id AND cc.is_ignored = false
    WHERE m.date::date BETWEEN ${PG_START}::date AND ${PG_END}::date
    GROUP BY CASE WHEN cc.product_id IS NOT NULL THEN 'classified' ELSE 'unclassified' END
  `;

  console.log('Ads tuples by product classification:');
  for (const r of classified) {
    console.log(`  ${r.status}: ${r.tuple_count} tuples, cost=${r.total_cost}`);
  }

  // 2. Get the classified campaign IDs (with product)
  const classifiedCampaigns = await sql`
    SELECT DISTINCT m.campaign_id
    FROM merged_ads_spending m
    INNER JOIN app_campaign_classifications cc
      ON m.campaign_id = cc.campaign_id AND cc.is_ignored = false
    WHERE m.date::date BETWEEN ${PG_START}::date AND ${PG_END}::date
      AND cc.product_id IS NOT NULL
  `;
  const classifiedCampaignSet = new Set(classifiedCampaigns.map(r => r.campaign_id));

  // 3. Get all CRM subs with tracking IDs
  const subs = await mariaQuery<{
    sub_id: number;
    customer_id: number;
    source: string | null;
    tracking_id_4: string | null;
    tracking_id_2: string | null;
    tracking_id: string | null;
  }>(`
    SELECT
      s.id AS sub_id,
      s.customer_id,
      COALESCE(sr.source, sr_sub.source) AS source,
      s.tracking_id_4,
      s.tracking_id_2,
      s.tracking_id
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, ...SOURCES]);

  // 4. Check which subs have their campaign classified
  let classifiedSubs = 0, unclassifiedSubs = 0, noTrackingSubs = 0;
  const unclassifiedSamples: typeof subs = [];

  for (const s of subs) {
    if (!isValid(s.tracking_id_4)) {
      noTrackingSubs++;
      continue;
    }
    if (classifiedCampaignSet.has(s.tracking_id_4!)) {
      classifiedSubs++;
    } else {
      unclassifiedSubs++;
      if (unclassifiedSamples.length < 10) unclassifiedSamples.push(s);
    }
  }

  console.log(`\nCRM subscriptions by campaign classification:`);
  console.log(`  Campaign classified (has product):  ${classifiedSubs}`);
  console.log(`  Campaign NOT classified:            ${unclassifiedSubs}`);
  console.log(`  No tracking ID:                     ${noTrackingSubs}`);
  console.log(`  Total:                              ${subs.length}`);
  console.log(`\n  → Unknown row should show ~${unclassifiedSubs + noTrackingSubs} subs`);

  // 5. Show unclassified campaign samples
  if (unclassifiedSamples.length > 0) {
    console.log('\n--- Subs with unclassified campaigns ---');
    // Get unique campaign IDs from unclassified
    const unclassifiedCampaignIds = [...new Set(unclassifiedSamples.map(s => s.tracking_id_4!))];
    console.log(`  Unique unclassified campaign IDs: ${unclassifiedCampaignIds.length}`);

    // Check if these campaigns exist in PG at all
    for (const cid of unclassifiedCampaignIds.slice(0, 5)) {
      const info = await sql`
        SELECT
          m.campaign_id,
          MAX(m.campaign_name) AS campaign_name,
          MAX(m.network) AS network,
          COUNT(*) AS row_count
        FROM merged_ads_spending m
        WHERE m.campaign_id = ${cid}
          AND m.date::date BETWEEN ${PG_START}::date AND ${PG_END}::date
        GROUP BY m.campaign_id
      `;
      if (info.length > 0) {
        const r = info[0];
        // Check if it's classified as ignored
        const classInfo = await sql`
          SELECT cc.is_ignored, ap.product_name
          FROM app_campaign_classifications cc
          LEFT JOIN app_products ap ON cc.product_id = ap.id
          WHERE cc.campaign_id = ${cid}
        `;
        const classStatus = classInfo.length > 0
          ? classInfo.map(c => `ignored=${c.is_ignored}, product=${c.product_name}`).join('; ')
          : 'NO classification entry';
        console.log(`  campaign=${cid} name="${r.campaign_name}" network=${r.network} — ${classStatus}`);
      } else {
        console.log(`  campaign=${cid} — NOT in PG for this date range`);
      }
    }
  }

  // 6. Also check: do any unclassified subs have tracking IDs that appear in classified ads via a DIFFERENT campaign?
  // This can happen if the matching cross-product finds them through another route
  console.log('\n--- Cross-check: are any "unclassified" subs matched via the ads cross-product? ---');
  // Get all (campaign, adset, ad) from classified product ads rows
  const classifiedTuples = await sql`
    SELECT DISTINCT m.campaign_id, m.adset_id, m.ad_id
    FROM merged_ads_spending m
    INNER JOIN app_campaign_classifications cc
      ON m.campaign_id = cc.campaign_id AND cc.is_ignored = false
    WHERE m.date::date BETWEEN ${PG_START}::date AND ${PG_END}::date
      AND cc.product_id IS NOT NULL
  `;
  const classifiedTupleSet = new Set(classifiedTuples.map(t => `${t.campaign_id}|${t.adset_id}|${t.ad_id}`));

  let crossMatched = 0;
  for (const s of subs) {
    if (!isValid(s.tracking_id_4) || classifiedCampaignSet.has(s.tracking_id_4!)) continue;
    const key = `${s.tracking_id_4}|${s.tracking_id_2}|${s.tracking_id}`;
    if (classifiedTupleSet.has(key)) crossMatched++;
  }
  console.log(`  Unclassified subs whose full tuple appears in classified ads: ${crossMatched}`);
  console.log(`  (These would be matched by the cross-product and NOT appear in Unknown)`);

  const trueUnknown = unclassifiedSubs - crossMatched + noTrackingSubs;
  console.log(`\n  → TRUE Unknown: ${trueUnknown} subs (unclassified ${unclassifiedSubs} - cross-matched ${crossMatched} + no-tracking ${noTrackingSubs})`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
