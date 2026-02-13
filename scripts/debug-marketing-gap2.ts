/**
 * Debug script part 2: Investigate WHY marketing report shows 382 subs
 * when CRM has 466 valid-tracking Google subs.
 *
 * Hypothesis: The marketing report groups by PG campaign classification country,
 * NOT by CRM customer country. The 466 includes subs from campaigns classified
 * as non-DK, or subs whose campaign has no classification at all.
 */
import mysql from 'mysql2/promise';
import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const START = '2026-01-12';
const END = '2026-02-09 23:59:59';
const PG_START = '2026-01-12';
const PG_END = '2026-02-09';

async function main() {
  const maria = await mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
  });
  const pg = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('=== HYPOTHESIS 1: Country classification mismatch ===\n');

  // Get ALL campaign_ids from PG that are classified as DK
  const dkCampaigns = await pg.query(`
    SELECT DISTINCT m.campaign_id
    FROM merged_ads_spending m
    LEFT JOIN app_campaign_classifications cc ON m.campaign_id = cc.campaign_id AND cc.is_ignored = false
    LEFT JOIN app_products ap ON cc.product_id = ap.id
    WHERE m.date::date BETWEEN $1::date AND $2::date
      AND LOWER(m.network) = 'google ads'
      AND COALESCE(cc.country_code, 'Unknown') = 'DK'
  `, [PG_START, PG_END]);
  console.log('PG campaigns classified as DK + Google Ads: ' + dkCampaigns.rows.length);

  // Get ALL campaign_ids from PG for Google Ads (any country)
  const allGoogleCampaigns = await pg.query(`
    SELECT DISTINCT m.campaign_id
    FROM merged_ads_spending m
    WHERE m.date::date BETWEEN $1::date AND $2::date
      AND LOWER(m.network) = 'google ads'
  `, [PG_START, PG_END]);
  console.log('PG campaigns Google Ads (any country): ' + allGoogleCampaigns.rows.length);

  // Show country classification breakdown for Google campaigns
  const countryBreakdown = await pg.query(`
    SELECT
      COALESCE(cc.country_code, 'Unknown') AS country,
      COUNT(DISTINCT m.campaign_id) AS campaigns,
      COUNT(DISTINCT m.ad_id) AS ads
    FROM merged_ads_spending m
    LEFT JOIN app_campaign_classifications cc ON m.campaign_id = cc.campaign_id AND cc.is_ignored = false
    WHERE m.date::date BETWEEN $1::date AND $2::date
      AND LOWER(m.network) = 'google ads'
    GROUP BY COALESCE(cc.country_code, 'Unknown')
    ORDER BY campaigns DESC
  `, [PG_START, PG_END]);
  console.log('\nPG Google Ads campaign country classifications:');
  for (const row of countryBreakdown.rows) {
    console.log('  ' + row.country + ': ' + row.campaigns + ' campaigns, ' + row.ads + ' ads');
  }

  console.log('\n=== HYPOTHESIS 2: Marketing report flow simulation ===\n');

  // Simulate the exact marketing report flow for DK > Google Ads:
  // Step 1: Get PG grouped data for network dimension under DK parent filter
  const pgAdsForDkGoogle = await pg.query(`
    SELECT
      array_agg(DISTINCT m.campaign_id) AS campaign_ids,
      array_agg(DISTINCT m.adset_id) AS adset_ids,
      array_agg(DISTINCT m.ad_id) AS ad_ids,
      array_agg(DISTINCT m.network) AS networks
    FROM merged_ads_spending m
    LEFT JOIN app_campaign_classifications cc ON m.campaign_id = cc.campaign_id AND cc.is_ignored = false
    WHERE m.date::date BETWEEN $1::date AND $2::date
      AND LOWER(m.network) = 'google ads'
      AND COALESCE(cc.country_code, 'Unknown') = 'DK'
  `, [PG_START, PG_END]);

  const pgRow = pgAdsForDkGoogle.rows[0];
  const campaignIds = pgRow?.campaign_ids || [];
  const adsetIds = pgRow?.adset_ids || [];
  const adIds = pgRow?.ad_ids || [];
  console.log('PG DK + Google Ads tracking IDs:');
  console.log('  campaign_ids: ' + campaignIds.length);
  console.log('  adset_ids: ' + adsetIds.length);
  console.log('  ad_ids: ' + adIds.length);

  // Step 2: Get CRM subs grouped by tracking tuple (what marketingQueryBuilder does)
  const [crmSubs] = await maria.query(`
    SELECT
      s.tracking_id_4 AS campaign_id,
      s.tracking_id_2 AS adset_id,
      s.tracking_id AS ad_id,
      DATE(s.date_create) AS date,
      COUNT(DISTINCT s.id) AS subscription_count,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
      sr.source AS source
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
    GROUP BY s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create)
  `, [START, END]);

  console.log('\nCRM subscription rows (all sources, valid tracking): ' + (crmSubs as any[]).length);

  // Step 3: Simulate the JS matching
  // Build CRM index
  type CrmRow = { campaign_id: string; adset_id: string; ad_id: string; subscription_count: number; customer_count: number; source: string };
  const crmIndex = new Map<string, CrmRow[]>();
  for (const crm of (crmSubs as CrmRow[])) {
    const key = [crm.campaign_id, crm.adset_id, crm.ad_id].join('|');
    if (!crmIndex.has(key)) crmIndex.set(key, []);
    crmIndex.get(key)!.push(crm);
  }
  console.log('CRM index entries (unique tuples): ' + crmIndex.size);

  // Build cross-product keys from PG arrays
  const crossKeys = new Set<string>();
  for (const c of campaignIds) {
    for (const a of adsetIds) {
      for (const d of adIds) {
        crossKeys.add([c, a, d].join('|'));
      }
    }
  }
  console.log('Cross-product keys: ' + crossKeys.size);

  // Match with source verification
  const SOURCE_MAP: Record<string, string[]> = {
    'google ads': ['adwords', 'google'],
  };

  let matchedSubs = 0;
  let matchedCustomers = 0;
  let sourceRejected = 0;
  let tupleNotFound = 0;
  let matchedKeys = 0;

  for (const key of crossKeys) {
    const rows = crmIndex.get(key);
    if (!rows) {
      tupleNotFound++;
      continue;
    }
    matchedKeys++;
    for (const crm of rows) {
      const srcLower = (crm.source || '').toLowerCase();
      const validSources = SOURCE_MAP['google ads'] || [];
      if (!validSources.includes(srcLower)) {
        sourceRejected++;
        continue;
      }
      matchedSubs += Number(crm.subscription_count || 0);
      matchedCustomers += Number(crm.customer_count || 0);
    }
  }

  console.log('\nMatching results:');
  console.log('  Matched subs: ' + matchedSubs);
  console.log('  Matched customers: ' + matchedCustomers);
  console.log('  Cross-product keys with CRM match: ' + matchedKeys);
  console.log('  Cross-product keys with NO CRM match: ' + tupleNotFound);
  console.log('  CRM rows rejected by source mismatch: ' + sourceRejected);

  // How many CRM subs are Google-sourced but their tuple isn't in PG cross-product?
  let unmatchedGoogleSubs = 0;
  let unmatchedGoogleCustomers = 0;
  for (const [key, rows] of crmIndex.entries()) {
    if (crossKeys.has(key)) continue;
    for (const crm of rows) {
      const srcLower = (crm.source || '').toLowerCase();
      if (['adwords', 'google'].includes(srcLower)) {
        unmatchedGoogleSubs += Number(crm.subscription_count || 0);
        unmatchedGoogleCustomers += Number(crm.customer_count || 0);
      }
    }
  }
  console.log('\n  Google subs in CRM but NOT in PG cross-product: ' + unmatchedGoogleSubs);
  console.log('  Google customers in CRM but NOT in PG cross-product: ' + unmatchedGoogleCustomers);

  console.log('\n=== HYPOTHESIS 3: CRM source JOIN path ===\n');

  // The dashboard uses COALESCE(sr.source, sr_sub.source) - checking both invoice and subscription source
  // The marketing report CRM query uses sr.source from s.source_id (subscription only)
  // Check if some subs have Google source on invoice but not on subscription
  const [sourcePathDiff] = await maria.query(`
    SELECT
      COUNT(DISTINCT s.id) AS subs,
      SUM(CASE WHEN LOWER(sr_sub.source) IN ('adwords', 'google') THEN 1 ELSE 0 END) AS sub_source_google,
      SUM(CASE WHEN LOWER(sr_inv.source) IN ('adwords', 'google') THEN 1 ELSE 0 END) AS inv_source_google,
      SUM(CASE WHEN LOWER(sr_sub.source) NOT IN ('adwords', 'google') AND LOWER(sr_inv.source) IN ('adwords', 'google') THEN 1 ELSE 0 END) AS inv_only_google
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    LEFT JOIN source sr_inv ON sr_inv.id = i.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
  `, [START, END]);
  console.log('Source path analysis (DK subs):');
  console.log('  Total subs:', (sourcePathDiff as any)[0].subs);
  console.log('  Sub source = Google:', (sourcePathDiff as any)[0].sub_source_google);
  console.log('  Invoice source = Google:', (sourcePathDiff as any)[0].inv_source_google);
  console.log('  Invoice Google but sub NOT Google:', (sourcePathDiff as any)[0].inv_only_google);

  console.log('\n=== TRIAL INVESTIGATION ===\n');

  // The marketing report trial query uses i.tracking_id_* (invoice tracking)
  // Get trial CRM data grouped by invoice tracking tuples
  const [trialCrm] = await maria.query(`
    SELECT
      i.tracking_id_4 AS campaign_id,
      i.tracking_id_2 AS adset_id,
      i.tracking_id AS ad_id,
      COUNT(DISTINCT i.id) AS trial_count,
      sr.source AS source
    FROM invoice i
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE i.type = 1 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND i.tracking_id_4 IS NOT NULL AND i.tracking_id_4 != 'null'
      AND i.tracking_id_2 IS NOT NULL AND i.tracking_id_2 != 'null'
      AND i.tracking_id IS NOT NULL AND i.tracking_id != 'null'
    GROUP BY i.tracking_id_4, i.tracking_id_2, i.tracking_id
  `, [START, END]);

  // Build trial index and match against PG cross-product
  let matchedTrials = 0;
  let unmatchedGoogleTrials = 0;
  const trialIndex = new Map<string, any[]>();
  for (const t of (trialCrm as any[])) {
    const key = [t.campaign_id, t.adset_id, t.ad_id].join('|');
    if (!trialIndex.has(key)) trialIndex.set(key, []);
    trialIndex.get(key)!.push(t);
  }

  for (const key of crossKeys) {
    const rows = trialIndex.get(key);
    if (!rows) continue;
    for (const t of rows) {
      const srcLower = (t.source || '').toLowerCase();
      if (['adwords', 'google'].includes(srcLower)) {
        matchedTrials += Number(t.trial_count || 0);
      }
    }
  }

  for (const [key, rows] of trialIndex.entries()) {
    if (crossKeys.has(key)) continue;
    for (const t of rows) {
      const srcLower = (t.source || '').toLowerCase();
      if (['adwords', 'google'].includes(srcLower)) {
        unmatchedGoogleTrials += Number(t.trial_count || 0);
      }
    }
  }

  console.log('Trial matching (PG DK cross-product):');
  console.log('  Matched trials: ' + matchedTrials);
  console.log('  Google trials NOT in PG cross-product: ' + unmatchedGoogleTrials);

  await maria.end();
  await pg.end();
}

main().catch(console.error);
