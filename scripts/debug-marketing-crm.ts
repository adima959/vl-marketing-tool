#!/usr/bin/env node
/**
 * Debug Marketing Report CRM data issue
 * Check if tracking IDs in ads match tracking IDs in CRM subscriptions
 */

import { Pool } from '@neondatabase/serverless';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

function createPgPool(): Pool {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  return new Pool({ connectionString: dbUrl });
}

function createMariaPool(): mysql.Pool {
  return mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 15000,
  });
}

async function debugMarketingCRM() {
  const pgPool = createPgPool();
  const mariaPool = createMariaPool();

  try {
    const date = '2026-02-10';

    console.log('🔍 Step 1: Check ads data for Google Ads on Feb 10\n');

    // Check ads from PostgreSQL
    const adsQuery = `
      SELECT
        network,
        campaign_name,
        campaign_id,
        adset_id,
        ad_id,
        SUM(clicks::integer) AS total_clicks,
        COUNT(DISTINCT campaign_id) as campaign_count
      FROM merged_ads_spending
      WHERE date::date = $1::date
        AND network = 'Google Ads'
      GROUP BY network, campaign_name, campaign_id, adset_id, ad_id
      ORDER BY total_clicks DESC
      LIMIT 5
    `;

    const adsResult = await pgPool.query(adsQuery, [date]);
    const adsRows = adsResult.rows;

    console.log(`Found ${adsRows.length} Google Ads campaigns with clicks:\n`);

    adsRows.forEach((row: any, index) => {
      console.log(`Ad #${index + 1}:`);
      console.log(`  Network: ${row.network}`);
      console.log(`  Campaign: ${row.campaign_name}`);
      console.log(`  Campaign ID: ${row.campaign_id}`);
      console.log(`  Adset ID: ${row.adset_id || '(null)'}`);
      console.log(`  Ad ID: ${row.ad_id || '(null)'}`);
      console.log(`  Clicks: ${row.total_clicks}`);
      console.log('');
    });

    if (adsRows.length === 0) {
      console.log('❌ No ads data found for Feb 10');
      return;
    }

    // Pick the first campaign to check
    const sampleCampaignId = adsRows[0].campaign_id;
    const sampleAdsetId = adsRows[0].adset_id;
    const sampleAdId = adsRows[0].ad_id;

    console.log(`\n🔍 Step 2: Check CRM subscriptions for tracking IDs:\n`);
    console.log(`  Campaign ID: ${sampleCampaignId}`);
    console.log(`  Adset ID: ${sampleAdsetId || '(null)'}`);
    console.log(`  Ad ID: ${sampleAdId || '(null)'}\n`);

    // Check CRM subscriptions matching these tracking IDs
    const crmQuery = `
      SELECT
        s.id AS subscription_id,
        s.tracking_id_4 AS campaign_id,
        s.tracking_id_2 AS adset_id,
        s.tracking_id AS ad_id,
        DATE(s.date_create) AS subscription_date,
        c.email,
        s.deleted
      FROM subscription s
      INNER JOIN customer c ON c.id = s.customer_id
      WHERE s.tracking_id_4 = ?
        AND DATE(s.date_create) >= ?
      LIMIT 10
    `;

    const [crmRows] = await mariaPool.execute(crmQuery, [sampleCampaignId, date]);
    const crmResults = crmRows as any[];

    console.log(`Found ${crmResults.length} subscription(s) matching campaign ID ${sampleCampaignId}:\n`);

    if (crmResults.length === 0) {
      console.log('❌ No CRM subscriptions found for this campaign ID');
      console.log('\n💡 This explains why CRM columns are empty:');
      console.log('   - Ads data exists in PostgreSQL');
      console.log('   - But no subscriptions have matching tracking IDs in MariaDB');
      console.log('   - Possible causes:');
      console.log('     1. Tracking IDs not being recorded correctly in subscriptions');
      console.log('     2. Time delay between ad clicks and subscriptions');
      console.log('     3. Different date ranges (ad date vs subscription date)');
    } else {
      crmResults.forEach((row, index) => {
        console.log(`Subscription #${index + 1}:`);
        console.log(`  Subscription ID: ${row.subscription_id}`);
        console.log(`  Customer: ${row.email}`);
        console.log(`  Campaign ID: ${row.campaign_id}`);
        console.log(`  Adset ID: ${row.adset_id || '(null)'}`);
        console.log(`  Ad ID: ${row.ad_id || '(null)'}`);
        console.log(`  Subscription Date: ${row.subscription_date}`);
        console.log(`  Deleted: ${row.deleted ? 'YES' : 'NO'}`);
        console.log('');
      });
    }

    // Check if there are ANY subscriptions for Feb 10
    console.log('\n🔍 Step 3: Check if there are ANY subscriptions on Feb 10\n');

    const allSubsQuery = `
      SELECT
        COUNT(*) AS total_subs,
        COUNT(CASE WHEN tracking_id_4 IS NOT NULL AND tracking_id_4 != '' THEN 1 END) AS subs_with_tracking
      FROM subscription
      WHERE DATE(date_create) = ?
    `;

    const [subsCount] = await mariaPool.execute(allSubsQuery, [date]);
    const subsCountRow = (subsCount as any[])[0];

    console.log(`Total subscriptions on ${date}: ${subsCountRow.total_subs}`);
    console.log(`Subscriptions with tracking IDs: ${subsCountRow.subs_with_tracking}`);
    console.log('');

    if (subsCountRow.total_subs === 0) {
      console.log('❌ No subscriptions at all on this date');
    } else if (subsCountRow.subs_with_tracking === 0) {
      console.log('⚠️  Subscriptions exist but NONE have tracking IDs!');
      console.log('   This explains why CRM data is empty on Marketing Report.');
    } else {
      console.log('✅ Some subscriptions have tracking IDs');
      console.log('   The issue might be a mismatch between ad tracking IDs and subscription tracking IDs');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pgPool.end();
    await mariaPool.end();
  }
}

debugMarketingCRM()
  .then(() => {
    console.log('\n✅ Diagnostic complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnostic failed:', error);
    process.exit(1);
  });
