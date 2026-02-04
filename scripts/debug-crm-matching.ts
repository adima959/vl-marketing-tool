/**
 * Debug script to trace CRM data matching for a specific campaign
 * Run with: npx tsx scripts/debug-crm-matching.ts
 */

import { Pool } from '@neondatabase/serverless';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const CAMPAIGN_SEARCH = 'SWE_FLEX_27/1';
const DATE_START = '2026-02-01';
const DATE_END = '2026-02-02';

async function main() {
  console.log('='.repeat(80));
  console.log('CRM MATCHING DEBUG - Campaign:', CAMPAIGN_SEARCH);
  console.log('Date Range:', DATE_START, 'to', DATE_END);
  console.log('='.repeat(80));

  // PostgreSQL connection
  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // MariaDB connection
  const mariaPool = await mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
  });

  try {
    // Step 1: Find campaigns matching the search term
    console.log('\n📊 STEP 1: PostgreSQL - Find campaigns matching:', CAMPAIGN_SEARCH);
    console.log('-'.repeat(60));

    const campaignsQuery = `
      SELECT DISTINCT campaign_name, campaign_id, network
      FROM merged_ads_spending
      WHERE campaign_name LIKE $1
        AND date::date BETWEEN $2::date AND $3::date
      ORDER BY campaign_name
    `;

    const campaigns = await pgPool.query(campaignsQuery, [`%${CAMPAIGN_SEARCH}%`, DATE_START, DATE_END]);
    console.log('Found campaigns:');
    campaigns.rows.forEach((c: any, i: number) => {
      console.log(`  ${i + 1}. "${c.campaign_name}"`);
      console.log(`     campaign_id: ${c.campaign_id}`);
      console.log(`     network: ${c.network}`);
    });

    if (campaigns.rows.length === 0) {
      console.log('No campaigns found matching the search term.');
      return;
    }

    // Step 2: Get ID mappings for these campaigns
    console.log('\n📊 STEP 2: PostgreSQL - Get all ID mappings for matching campaigns');
    console.log('-'.repeat(60));

    const mappingsQuery = `
      SELECT DISTINCT
        campaign_name,
        campaign_id,
        adset_id,
        adset_name,
        ad_id,
        ad_name,
        network,
        SUM(conversions::numeric) as total_conversions
      FROM merged_ads_spending
      WHERE campaign_name LIKE $1
        AND date::date BETWEEN $2::date AND $3::date
      GROUP BY campaign_name, campaign_id, adset_id, adset_name, ad_id, ad_name, network
      ORDER BY total_conversions DESC
    `;

    const mappings = await pgPool.query(mappingsQuery, [`%${CAMPAIGN_SEARCH}%`, DATE_START, DATE_END]);
    console.log(`Found ${mappings.rows.length} ad combinations:`);
    mappings.rows.forEach((m: any, i: number) => {
      console.log(`\n  ${i + 1}. Conversions: ${m.total_conversions}`);
      console.log(`     campaign_id:  "${m.campaign_id}"`);
      console.log(`     adset_id:     "${m.adset_id}"`);
      console.log(`     ad_id:        "${m.ad_id}"`);
      console.log(`     network:      "${m.network}"`);
      console.log(`     adset_name:   "${m.adset_name}"`);
      console.log(`     ad_name:      "${m.ad_name}"`);
    });

    // Step 3: Query MariaDB for each mapping
    console.log('\n📊 STEP 3: MariaDB - Search for CRM data with matching tracking IDs');
    console.log('-'.repeat(60));

    for (const mapping of mappings.rows as any[]) {
      console.log(`\n🔍 Looking for CRM data matching:`);
      console.log(`   campaign_id (tracking_id_4): "${mapping.campaign_id}"`);
      console.log(`   adset_id (tracking_id_2):    "${mapping.adset_id}"`);
      console.log(`   ad_id (tracking_id):         "${mapping.ad_id}"`);

      // Exact match query
      const [exactMatches] = await mariaPool.execute(`
        SELECT
          sr.source,
          s.tracking_id_4 as campaign_id,
          s.tracking_id_2 as adset_id,
          s.tracking_id as ad_id,
          DATE(s.date_create) as date,
          p.product_name,
          COUNT(DISTINCT s.id) as subscription_count,
          COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) as approved_count
        FROM subscription s
        INNER JOIN invoice i ON i.subscription_id = s.id
          AND i.type = 1
          AND i.deleted = 0
        LEFT JOIN source sr ON sr.id = s.source_id
        LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
        LEFT JOIN product p ON p.id = ip.product_id
        WHERE s.tracking_id_4 = ?
          AND s.tracking_id_2 = ?
          AND s.tracking_id = ?
          AND s.date_create BETWEEN ? AND ?
          AND s.deleted = 0
          AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
        GROUP BY sr.source, s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create), p.product_name
      `, [mapping.campaign_id, mapping.adset_id, mapping.ad_id, `${DATE_START} 00:00:00`, `${DATE_END} 23:59:59`]);

      console.log(`   Exact matches found: ${(exactMatches as any[]).length}`);
      (exactMatches as any[]).forEach((m: any) => {
        console.log(`     - source: "${m.source}", subs: ${m.subscription_count}, approved: ${m.approved_count}, product: ${m.product_name}`);
      });

      // If no exact matches, check for partial matches
      if ((exactMatches as any[]).length === 0) {
        console.log(`\n   ⚠️  No exact match. Checking for partial matches...`);

        // Check campaign_id only
        const [campaignMatches] = await mariaPool.execute(`
          SELECT DISTINCT
            sr.source,
            s.tracking_id_4 as campaign_id,
            s.tracking_id_2 as adset_id,
            s.tracking_id as ad_id,
            COUNT(DISTINCT s.id) as subscription_count
          FROM subscription s
          LEFT JOIN source sr ON sr.id = s.source_id
          WHERE s.tracking_id_4 = ?
            AND s.date_create BETWEEN ? AND ?
            AND s.deleted = 0
          GROUP BY sr.source, s.tracking_id_4, s.tracking_id_2, s.tracking_id
          LIMIT 10
        `, [mapping.campaign_id, `${DATE_START} 00:00:00`, `${DATE_END} 23:59:59`]);

        console.log(`   Matches by campaign_id only: ${(campaignMatches as any[]).length}`);
        (campaignMatches as any[]).forEach((m: any) => {
          const adsetMatch = m.adset_id === mapping.adset_id ? '✓' : '✗';
          const adMatch = m.ad_id === mapping.ad_id ? '✓' : '✗';
          console.log(`     - source: "${m.source}", adset_id: "${m.adset_id}" ${adsetMatch}, ad_id: "${m.ad_id}" ${adMatch}`);
        });

        // Check if there's data with different tracking but same date
        const [dateMatches] = await mariaPool.execute(`
          SELECT DISTINCT
            sr.source,
            s.tracking_id_4 as campaign_id,
            s.tracking_id_2 as adset_id,
            s.tracking_id as ad_id
          FROM subscription s
          LEFT JOIN source sr ON sr.id = s.source_id
          WHERE (
            s.tracking_id_4 LIKE ?
            OR s.tracking_id_2 LIKE ?
            OR s.tracking_id LIKE ?
          )
            AND s.date_create BETWEEN ? AND ?
            AND s.deleted = 0
          LIMIT 20
        `, [`%FLEX%`, `%FLEX%`, `%FLEX%`, `${DATE_START} 00:00:00`, `${DATE_END} 23:59:59`]);

        console.log(`\n   Matches containing "FLEX" in tracking IDs: ${(dateMatches as any[]).length}`);
        (dateMatches as any[]).slice(0, 5).forEach((m: any) => {
          console.log(`     - source: "${m.source}"`);
          console.log(`       campaign_id: "${m.campaign_id}"`);
          console.log(`       adset_id: "${m.adset_id}"`);
          console.log(`       ad_id: "${m.ad_id}"`);
        });
      }
    }

    // Step 4: Check what sources exist
    console.log('\n📊 STEP 4: MariaDB - List all sources in the source table');
    console.log('-'.repeat(60));

    const [sources] = await mariaPool.query(`
      SELECT DISTINCT sr.source
      FROM source sr
      WHERE sr.source IS NOT NULL
      ORDER BY sr.source
    `);
    console.log('Available sources:');
    (sources as any[]).forEach((s: any) => {
      console.log(`  - "${s.source}"`);
    });

    // Step 5: Check for any Facebook-related sources in date range
    console.log('\n📊 STEP 5: MariaDB - All subscriptions from Facebook sources in date range');
    console.log('-'.repeat(60));

    const [fbSubs] = await mariaPool.execute(`
      SELECT
        sr.source,
        s.tracking_id_4 as campaign_id,
        s.tracking_id_2 as adset_id,
        s.tracking_id as ad_id,
        COUNT(DISTINCT s.id) as subscription_count
      FROM subscription s
      LEFT JOIN source sr ON sr.id = s.source_id
      WHERE (sr.source = 'facebook' OR sr.source = 'meta' OR sr.source = 'Facebook')
        AND s.date_create BETWEEN ? AND ?
        AND s.deleted = 0
        AND s.tracking_id_4 IS NOT NULL
        AND s.tracking_id_4 != 'null'
      GROUP BY sr.source, s.tracking_id_4, s.tracking_id_2, s.tracking_id
      ORDER BY subscription_count DESC
      LIMIT 30
    `, [`${DATE_START} 00:00:00`, `${DATE_END} 23:59:59`]);

    console.log(`Found ${(fbSubs as any[]).length} subscription groups from Facebook:`);
    (fbSubs as any[]).forEach((s: any) => {
      console.log(`  - [${s.subscription_count} subs] source: "${s.source}"`);
      console.log(`    campaign_id: "${s.campaign_id}"`);
      console.log(`    adset_id: "${s.adset_id}"`);
      console.log(`    ad_id: "${s.ad_id}"`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('DEBUG COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pgPool.end();
    await mariaPool.end();
  }
}

main();
