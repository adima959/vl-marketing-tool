/**
 * Debug: analyze the "Unknown" row in the marketing report.
 *
 * Shows which CRM subscriptions are matched vs unmatched by tracking IDs,
 * and why unmatched ones end up in the Unknown row.
 *
 * Usage: npx tsx scripts/debug-unknown-row.ts
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
const COUNTRY = 'denmark';

async function mariaQuery<T>(query: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = params.length > 0 ? await pool.execute(query, params) : await pool.query(query);
  return rows as T[];
}

function isValid(id: string | null): boolean {
  return id != null && id !== 'null' && id !== '';
}

async function main(): Promise<void> {
  console.log(`=== Unknown Row Debug: ${PG_START} to ${PG_END}, ${COUNTRY} ===\n`);

  // 1. Get all CRM subscriptions with their tracking IDs
  const subs = await mariaQuery<{
    sub_id: number;
    customer_id: number;
    source: string | null;
    inv_source: string | null;
    tracking_id_4: string | null;
    tracking_id_2: string | null;
    tracking_id: string | null;
  }>(`
    SELECT
      s.id AS sub_id,
      s.customer_id,
      sr_sub.source AS source,
      sr.source AS inv_source,
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
      AND LOWER(c.country) = ?
      AND LOWER(COALESCE(sr.source, sr_sub.source)) IN (${SOURCES.map(() => '?').join(',')})
  `, [START, END, COUNTRY, ...SOURCES]);

  console.log(`Total CRM subscriptions (adwords/facebook, DK): ${subs.length}\n`);

  // 2. Categorize by tracking tier
  const tiers = { full: [] as typeof subs, campaignAdset: [] as typeof subs, campaignOnly: [] as typeof subs, sourceOnly: [] as typeof subs };
  for (const s of subs) {
    const hasCampaign = isValid(s.tracking_id_4);
    const hasAdset = isValid(s.tracking_id_2);
    const hasAd = isValid(s.tracking_id);
    if (hasCampaign && hasAdset && hasAd) tiers.full.push(s);
    else if (hasCampaign && hasAdset) tiers.campaignAdset.push(s);
    else if (hasCampaign) tiers.campaignOnly.push(s);
    else tiers.sourceOnly.push(s);
  }

  console.log('Tracking ID tier breakdown:');
  console.log(`  Full (campaign+adset+ad):  ${tiers.full.length}`);
  console.log(`  Campaign+Adset only:       ${tiers.campaignAdset.length}`);
  console.log(`  Campaign only:             ${tiers.campaignOnly.length}`);
  console.log(`  Source only (no tracking):  ${tiers.sourceOnly.length}`);

  // 3. Get all PG ads tracking tuples for this date range
  const pgTuples = await sql`
    SELECT DISTINCT campaign_id, adset_id, ad_id
    FROM merged_ads_spending
    WHERE date::date BETWEEN ${PG_START}::date AND ${PG_END}::date
  `;

  console.log(`\nPostgreSQL ads tuples: ${pgTuples.length}\n`);

  // Build lookup sets for each tier
  const fullKeys = new Set(pgTuples.map(t => `${t.campaign_id}|${t.adset_id}|${t.ad_id}`));
  const caKeys = new Set(pgTuples.map(t => `${t.campaign_id}|${t.adset_id}`));
  const cKeys = new Set(pgTuples.map(t => `${t.campaign_id}`));

  // 4. Check which CRM subs match PG tuples
  let matchedFull = 0, unmatchedFull = 0;
  let matchedCA = 0, unmatchedCA = 0;
  let matchedC = 0, unmatchedC = 0;

  const unmatchedFullSamples: typeof subs = [];
  const unmatchedCASamples: typeof subs = [];
  const unmatchedCSamples: typeof subs = [];

  for (const s of tiers.full) {
    const key = `${s.tracking_id_4}|${s.tracking_id_2}|${s.tracking_id}`;
    if (fullKeys.has(key)) {
      matchedFull++;
    } else {
      unmatchedFull++;
      if (unmatchedFullSamples.length < 5) unmatchedFullSamples.push(s);
    }
  }

  for (const s of tiers.campaignAdset) {
    const key = `${s.tracking_id_4}|${s.tracking_id_2}`;
    if (caKeys.has(key)) {
      matchedCA++;
    } else {
      unmatchedCA++;
      if (unmatchedCASamples.length < 5) unmatchedCASamples.push(s);
    }
  }

  for (const s of tiers.campaignOnly) {
    if (cKeys.has(s.tracking_id_4!)) {
      matchedC++;
    } else {
      unmatchedC++;
      if (unmatchedCSamples.length < 5) unmatchedCSamples.push(s);
    }
  }

  console.log('Matching results:');
  console.log(`  Full tier:         ${matchedFull} matched, ${unmatchedFull} unmatched`);
  console.log(`  Campaign+Adset:    ${matchedCA} matched, ${unmatchedCA} unmatched`);
  console.log(`  Campaign only:     ${matchedC} matched, ${unmatchedC} unmatched`);
  console.log(`  Source only:       ${tiers.sourceOnly.length} (always matched to any ads row with same network)`);

  const totalUnmatched = unmatchedFull + unmatchedCA + unmatchedC;
  console.log(`\n  TOTAL UNMATCHED: ${totalUnmatched} subscriptions (these form the Unknown row)`);
  console.log(`  Note: source-only subs (${tiers.sourceOnly.length}) get matched to every ads row with the same network, so they don't appear in Unknown.`);

  // 5. Show samples of unmatched
  if (unmatchedFullSamples.length > 0) {
    console.log('\n--- Sample unmatched (full tier) ---');
    for (const s of unmatchedFullSamples) {
      console.log(`  sub=${s.sub_id} cust=${s.customer_id} source=${s.source ?? s.inv_source} tracking=(${s.tracking_id_4}, ${s.tracking_id_2}, ${s.tracking_id})`);
    }
  }

  if (unmatchedCASamples.length > 0) {
    console.log('\n--- Sample unmatched (campaign+adset tier) ---');
    for (const s of unmatchedCASamples) {
      console.log(`  sub=${s.sub_id} cust=${s.customer_id} source=${s.source ?? s.inv_source} tracking=(${s.tracking_id_4}, ${s.tracking_id_2}, ${s.tracking_id})`);
    }
  }

  if (unmatchedCSamples.length > 0) {
    console.log('\n--- Sample unmatched (campaign only tier) ---');
    for (const s of unmatchedCSamples) {
      console.log(`  sub=${s.sub_id} cust=${s.customer_id} source=${s.source ?? s.inv_source} tracking=(${s.tracking_id_4}, ${s.tracking_id_2}, ${s.tracking_id})`);
    }
  }

  if (tiers.sourceOnly.length > 0) {
    console.log('\n--- Sample source-only (no tracking IDs) ---');
    for (const s of tiers.sourceOnly.slice(0, 5)) {
      console.log(`  sub=${s.sub_id} cust=${s.customer_id} source=${s.source ?? s.inv_source} tracking=(${s.tracking_id_4}, ${s.tracking_id_2}, ${s.tracking_id})`);
    }
  }

  // 6. Check if unmatched tracking IDs exist in PG at ALL (outside date range?)
  if (unmatchedFullSamples.length > 0) {
    console.log('\n--- Do unmatched tracking IDs exist in PG at all? ---');
    for (const s of unmatchedFullSamples.slice(0, 3)) {
      const found = await sql`
        SELECT MIN(date::date) AS first_date, MAX(date::date) AS last_date, COUNT(*) AS cnt
        FROM merged_ads_spending
        WHERE campaign_id = ${s.tracking_id_4}
          AND adset_id = ${s.tracking_id_2}
          AND ad_id = ${s.tracking_id}
      `;
      const r = found[0];
      if (r && Number(r.cnt) > 0) {
        console.log(`  sub=${s.sub_id}: YES — PG has ${r.cnt} rows, date range ${r.first_date} to ${r.last_date}`);
      } else {
        // Check if campaign_id exists at all
        const campaignFound = await sql`
          SELECT COUNT(*) AS cnt FROM merged_ads_spending WHERE campaign_id = ${s.tracking_id_4} LIMIT 1
        `;
        console.log(`  sub=${s.sub_id}: NO exact match — campaign_id exists in PG: ${Number(campaignFound[0]?.cnt) > 0 ? 'YES' : 'NO'}`);
      }
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
