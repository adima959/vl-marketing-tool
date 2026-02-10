#!/usr/bin/env node
/**
 * Debug Hormonelle-SWE-x3-[199/1194] discrepancies
 * - CRM: 19 subscriptions (18 Denmark + 1 Sweden)
 * - Dashboard: 18 subscriptions
 * - Marketing Report: 14 subscriptions
 *
 * Uses shared filter functions from crmFilters.ts to ensure
 * business logic matches production Dashboard and Marketing Report
 */

import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { getIneligibilityReasons, isEligibleForTrialCount, isEligibleForMarketingMatch } from '@/lib/server/crmFilters';

config({ path: '.env.local' });

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

async function debugHormonelle() {
  const pool = createMariaPool();

  try {
    const date = '2026-02-10';
    const productCode = 'Hormonelle-SWE-x3';

    console.log('🔍 Investigating Hormonelle-SWE-x3 subscriptions for Feb 10\n');

    // Find all subscriptions for this product using the invoice_product join pattern
    const query = `
      SELECT
        s.id AS subscription_id,
        s.tracking_id AS ad_id,
        s.tracking_id_2 AS adset_id,
        s.tracking_id_4 AS campaign_id,
        c.country_code,
        sr.source,
        sr.id AS source_id,
        i.id AS invoice_id,
        i.type AS invoice_type,
        i.tag AS invoice_tag,
        i.is_marked AS invoice_is_marked,
        i.deleted AS invoice_deleted,
        DATE(s.date_create) AS subscription_date,
        s.deleted AS subscription_deleted,
        p.product_name
      FROM subscription s
      INNER JOIN customer c ON c.id = s.customer_id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      WHERE DATE(s.date_create) = ?
        AND EXISTS (
          SELECT 1 FROM invoice_product ip2
          INNER JOIN product p2 ON p2.id = ip2.product_id
          WHERE ip2.invoice_id = i.id AND p2.product_name LIKE ?
        )
      ORDER BY c.country_code, s.id
    `;

    const [rows] = await pool.execute(query, [date, `${productCode}%`]);
    const results = rows as any[];

    console.log(`Found ${results.length} subscription(s) for ${productCode}:\n`);

    // Group by country
    const byCountry = new Map<string, any[]>();
    const withTracking = results.filter(r => r.campaign_id);
    const withoutTracking = results.filter(r => !r.campaign_id);
    const withUpsellTags = results.filter(r => r.invoice_tag && r.invoice_tag.includes('parent-sub-id='));

    results.forEach((row) => {
      const country = row.country_code || 'NULL';
      if (!byCountry.has(country)) {
        byCountry.set(country, []);
      }
      byCountry.get(country)!.push(row);
    });

    // Print summary by country
    console.log('📊 By Country:');
    for (const [country, subs] of byCountry.entries()) {
      console.log(`  ${country}: ${subs.length} subscriptions`);
    }
    console.log('');

    // Print tracking stats
    console.log('📊 Tracking ID Stats:');
    console.log(`  With tracking IDs: ${withTracking.length}`);
    console.log(`  Without tracking IDs: ${withoutTracking.length}`);
    console.log(`  With upsell tags (excluded from trials): ${withUpsellTags.length}`);
    console.log('');

    // Print all subscriptions in detail
    console.log('📋 All Subscriptions:\n');
    results.forEach((row, index) => {
      console.log(`#${index + 1} - Subscription ${row.subscription_id}:`);
      console.log(`  Country: ${row.country_code}`);
      console.log(`  Product: ${row.product_name || '(NULL)'}`);
      console.log(`  Source: ${row.source || '(NULL)'} (ID: ${row.source_id || 'NULL'})`);
      console.log(`  Campaign ID: ${row.campaign_id || '(NULL)'}`);
      console.log(`  Adset ID: ${row.adset_id || '(NULL)'}`);
      console.log(`  Ad ID: ${row.ad_id || '(NULL)'}`);
      console.log(`  Invoice ID: ${row.invoice_id || '(NULL)'}`);
      console.log(`  Invoice Type: ${row.invoice_type || '(NULL)'}`);
      console.log(`  Invoice Tag: ${row.invoice_tag || '(none)'}`);
      console.log(`  Invoice Marked: ${row.invoice_is_marked ? 'YES' : 'NO'}`);
      console.log(`  Invoice Deleted: ${row.invoice_deleted ? 'YES' : 'NO'}`);
      console.log(`  Subscription Deleted: ${row.subscription_deleted ? 'YES' : 'NO'}`);

      // Highlight issues using shared business logic
      const issues = getIneligibilityReasons(row);
      if (issues.length > 0) {
        console.log(`  ⚠️  Issues: ${issues.join(', ')}`);
      }
      console.log('');
    });

    // Check source distribution
    console.log('📊 Source Distribution:');
    const bySources = new Map<string, number>();
    results.forEach(r => {
      const source = r.source || '(NULL)';
      bySources.set(source, (bySources.get(source) || 0) + 1);
    });
    for (const [source, count] of bySources.entries()) {
      console.log(`  ${source}: ${count}`);
    }
    console.log('');

    // Summary for Dashboard expectations
    console.log('💡 Dashboard Expectations:');
    console.log('  Dashboard queries by geography mode (country)');
    console.log('  Should show all subscriptions grouped by country');
    console.log('  Does NOT require tracking IDs');
    console.log('  DOES exclude upsell-tagged invoices from trial counts');
    console.log('');

    // Summary for Marketing Report expectations
    console.log('💡 Marketing Report Expectations:');
    console.log('  Requires tracking IDs (campaign_id, adset_id, ad_id)');
    console.log('  Requires source matching (Adwords → Google Ads)');
    console.log('  Excludes upsell-tagged invoices from trial counts');
    console.log('  Matches using tuple: campaign_id|adset_id|ad_id');
    console.log('');

    // Calculate expected counts using shared business logic
    const dashboardEligible = results.filter(isEligibleForTrialCount);
    const marketingEligible = results.filter(isEligibleForMarketingMatch);

    console.log('📊 Expected Counts:');
    console.log(`  Total subscriptions: ${results.length}`);
    console.log(`  Dashboard eligible: ${dashboardEligible.length}`);
    console.log(`  Marketing Report eligible: ${marketingEligible.length}`);
    console.log('');

    if (dashboardEligible.length !== 18) {
      console.log(`⚠️  Dashboard should show ${dashboardEligible.length}, but user reports 18`);
    }

    if (marketingEligible.length !== 14) {
      console.log(`⚠️  Marketing Report should show ${marketingEligible.length}, but user reports 14`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

debugHormonelle()
  .then(() => {
    console.log('✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  });
