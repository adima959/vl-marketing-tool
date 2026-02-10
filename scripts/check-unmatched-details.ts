/**
 * Dig into the unmatched CRM subs from test 6 and the null source anomaly from test 4
 * Usage: node --experimental-strip-types scripts/check-unmatched-details.ts
 */
import { Pool } from '@neondatabase/serverless';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env.local' });

const pg = new Pool({ connectionString: process.env.DATABASE_URL });
const maria = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectionLimit: 5,
});

async function checkNullSource(): Promise<void> {
  console.log('=== NULL/empty source anomaly ===\n');

  // CRM: what does source_normalized='' look like?
  const [crmEmpty] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT subscription_id, source_normalized, ff_vid, tracking_id, tracking_id_2, tracking_id_4
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN '2026-02-02 00:00:00' AND '2026-02-07 23:59:59'
       AND (source_normalized = '' OR source_normalized IS NULL)`,
    []
  );
  console.log(`CRM subs with empty/null source: ${crmEmpty.length}`);
  for (const r of crmEmpty) {
    console.log(`  sub=${r.subscription_id} src='${r.source_normalized}' ff_vid=${r.ff_vid || '(null)'} tid=${r.tracking_id || '(empty)'} tid4=${r.tracking_id_4 || '(empty)'}`);
  }

  // PG: what LOWER(utm_source) values exist?
  const pgNull = await pg.query(
    `SELECT LOWER(utm_source) as src, COUNT(*) as cnt
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at >= '2026-02-02'::date AND created_at < '2026-02-08'::date
       AND (utm_source IS NULL OR LOWER(utm_source) = '')
     GROUP BY LOWER(utm_source)`,
    []
  );
  console.log('\nPG rows with NULL/empty utm_source:');
  for (const r of pgNull.rows) {
    console.log(`  src=${r.src === null ? '(null)' : `'${r.src}'`} → ${r.cnt} page views`);
  }

  // How does the direct CRM match work for NULL?
  // PG dimension_value = NULL → crmKey = 'unknown'
  // CRM source_normalized = '' → key = '' (lowercased)
  // So 'unknown' != '' → should NOT match
  console.log('\nKey mapping:');
  console.log("  PG NULL utm_source → dimension_value=NULL → crmKey='unknown'");
  console.log("  CRM source_normalized='' → key=''");
  console.log("  'unknown' != '' → should NOT match in route");
  console.log("  But test script may have a bug in how it handles this");
}

async function checkUnmatchedFeb3(): Promise<void> {
  console.log('\n\n=== Unmatched CRM subs on Feb 3 ===\n');

  // Get all enriched subs for Feb 3
  const [allSubs] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT subscription_id, source_normalized, tracking_id_4, tracking_id_2, tracking_id, ff_vid
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN '2026-02-03 00:00:00' AND '2026-02-03 23:59:59'`,
    []
  );

  // Get PG visitor IDs for Feb 3
  const pgVisitors = await pg.query(
    `SELECT DISTINCT ff_visitor_id
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at >= '2026-02-03'::date AND created_at < '2026-02-04'::date
       AND ff_visitor_id IS NOT NULL`,
    []
  );
  const pgVids = new Set(pgVisitors.rows.map((r: any) => r.ff_visitor_id));

  // Get PG tracking combos for Feb 3
  const pgCombos = await pg.query(
    `SELECT DISTINCT
       CASE
         WHEN LOWER(utm_source) IN ('google', 'adwords') THEN 'google'
         WHEN LOWER(utm_source) IN ('facebook', 'meta') THEN 'facebook'
         ELSE LOWER(COALESCE(utm_source, ''))
       END as source,
       COALESCE(utm_campaign, '') as campaign_id,
       COALESCE(utm_content, '') as adset_id,
       COALESCE(utm_medium, '') as ad_id
     FROM remote_session_tracker.event_page_view_enriched_v2
     WHERE created_at >= '2026-02-03'::date AND created_at < '2026-02-04'::date
       AND utm_source IS NOT NULL`,
    []
  );
  const pgComboSet = new Set(pgCombos.rows.map((r: any) =>
    `${r.source}::${r.campaign_id}::${r.adset_id}::${r.ad_id}`
  ));

  console.log(`Total enriched subs: ${allSubs.length}`);
  console.log(`PG visitor IDs: ${pgVids.size}`);
  console.log(`PG tracking combos: ${pgComboSet.size}`);

  // Check each sub
  const unmatched: any[] = [];
  for (const sub of allSubs) {
    const vidMatch = sub.ff_vid && pgVids.has(sub.ff_vid);

    const normalize = (v: any) => v === 'null' || v === null ? '' : String(v);
    const comboKey = `${normalize(sub.source_normalized)}::${normalize(sub.tracking_id_4)}::${normalize(sub.tracking_id_2)}::${normalize(sub.tracking_id)}`;

    // Check partial combo matches too (source only, source+campaign, etc.)
    let comboMatch = pgComboSet.has(comboKey);
    // Also check if any PG combo matches on just source+campaign (since the query uses AND for non-empty fields)
    if (!comboMatch) {
      for (const pgCombo of pgComboSet) {
        const [pSrc, pCamp, pAdset, pAd] = pgCombo.split('::');
        let matches = true;
        if (sub.source_normalized && pSrc !== normalize(sub.source_normalized)) matches = false;
        if (sub.tracking_id_4 && pCamp !== normalize(sub.tracking_id_4)) matches = false;
        if (sub.tracking_id_2 && pAdset !== normalize(sub.tracking_id_2)) matches = false;
        if (sub.tracking_id && pAd !== normalize(sub.tracking_id)) matches = false;
        if (matches) { comboMatch = true; break; }
      }
    }

    if (!vidMatch && !comboMatch) {
      unmatched.push(sub);
    }
  }

  console.log(`\nUnmatched subs: ${unmatched.length}`);
  for (const sub of unmatched) {
    console.log(`  sub=${sub.subscription_id} src=${sub.source_normalized || '(empty)'} campaign=${sub.tracking_id_4 || '(empty)'} adset=${sub.tracking_id_2 || '(empty)'} ad=${sub.tracking_id || '(empty)'} ff_vid=${sub.ff_vid || '(null)'}`);

    // Check if ff_vid exists in PG at all (any date)
    if (sub.ff_vid) {
      const pgCheck = await pg.query(
        `SELECT COUNT(*) as cnt, MIN(created_at::date) as first_seen, MAX(created_at::date) as last_seen
         FROM remote_session_tracker.event_page_view_enriched_v2
         WHERE ff_visitor_id = $1`,
        [sub.ff_vid]
      );
      const r = pgCheck.rows[0];
      if (Number(r.cnt) > 0) {
        console.log(`    → ff_vid found in PG: ${r.cnt} page views, ${r.first_seen} to ${r.last_seen} (not on Feb 3)`);
      } else {
        console.log(`    → ff_vid NOT found in PG at all`);
      }
    }
  }
}

async function main(): Promise<void> {
  await checkNullSource();
  await checkUnmatchedFeb3();
  await pg.end();
  await maria.end();
}

main().catch(err => { console.error(err); process.exit(1); });
