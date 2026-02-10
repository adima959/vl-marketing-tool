#!/usr/bin/env node
/**
 * Check if Hormonelle subscriptions share the same campaign IDs
 * This would explain why CRM shows aggregated counts across products
 */

import mysql from 'mysql2/promise';
import { config } from 'dotenv';

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

async function debugHormonelleByCampaign() {
  const pool = createMariaPool();

  try {
    const date = '2026-02-10';

    console.log('🔍 Checking ALL Hormonelle subscriptions for Feb 10 by campaign\n');

    // Get all subscriptions for any Hormonelle product
    const query = `
      SELECT
        s.id AS subscription_id,
        s.tracking_id AS ad_id,
        s.tracking_id_2 AS adset_id,
        s.tracking_id_4 AS campaign_id,
        c.country_code,
        sr.source,
        i.id AS invoice_id,
        i.tag AS invoice_tag,
        i.is_marked AS invoice_is_marked,
        s.deleted AS subscription_deleted,
        i.deleted AS invoice_deleted,
        p.product_name
      FROM subscription s
      INNER JOIN customer c ON c.id = s.customer_id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      WHERE DATE(s.date_create) = ?
        AND s.deleted = 0
        AND EXISTS (
          SELECT 1 FROM invoice_product ip2
          INNER JOIN product p2 ON p2.id = ip2.product_id
          WHERE ip2.invoice_id = i.id AND p2.product_name LIKE 'Hormonelle%'
        )
      ORDER BY s.tracking_id_4, c.country_code, p.product_name, s.id
    `;

    const [rows] = await pool.execute(query, [date]);
    const results = rows as any[];

    console.log(`Found ${results.length} Hormonelle subscription(s) on Feb 10:\n`);

    // Group by product
    const byProduct = new Map<string, any[]>();
    results.forEach((row) => {
      const product = row.product_name || '(NULL)';
      if (!byProduct.has(product)) {
        byProduct.set(product, []);
      }
      byProduct.get(product)!.push(row);
    });

    console.log('📊 By Product:');
    for (const [product, subs] of byProduct.entries()) {
      const byCountry = new Map<string, number>();
      subs.forEach(s => {
        const country = s.country_code || 'NULL';
        byCountry.set(country, (byCountry.get(country) || 0) + 1);
      });

      console.log(`\n  ${product}: ${subs.length} total`);
      for (const [country, count] of byCountry.entries()) {
        console.log(`    ${country}: ${count}`);
      }
    }
    console.log('');

    // Group by campaign ID
    const byCampaign = new Map<string, any[]>();
    results.forEach((row) => {
      const campaign = row.campaign_id || '(NO TRACKING)';
      if (!byCampaign.has(campaign)) {
        byCampaign.set(campaign, []);
      }
      byCampaign.get(campaign)!.push(row);
    });

    console.log('📊 By Campaign ID:');
    for (const [campaign, subs] of byCampaign.entries()) {
      console.log(`\n  Campaign: ${campaign} (${subs.length} subscriptions)`);

      // Show products and countries for this campaign
      const products = new Set(subs.map(s => s.product_name));
      const byCountry = new Map<string, number>();
      subs.forEach(s => {
        const country = s.country_code || 'NULL';
        byCountry.set(country, (byCountry.get(country) || 0) + 1);
      });

      console.log(`    Products: ${Array.from(products).join(', ')}`);
      console.log(`    Countries:`);
      for (const [country, count] of byCountry.entries()) {
        console.log(`      ${country}: ${count}`);
      }
      console.log(`    Sources: ${Array.from(new Set(subs.map(s => s.source || 'NULL'))).join(', ')}`);
    }
    console.log('');

    // Check for upsell tags
    const withUpsellTags = results.filter(r =>
      r.invoice_tag && r.invoice_tag.includes('parent-sub-id=')
    );

    console.log('📊 Trial Count Stats:');
    console.log(`  Total subscriptions: ${results.length}`);
    console.log(`  With upsell tags (excluded): ${withUpsellTags.length}`);
    console.log(`  Eligible for trial count: ${results.length - withUpsellTags.length}`);
    console.log('');

    // Show all subscriptions
    console.log('📋 All Subscriptions:\n');
    results.forEach((row, index) => {
      console.log(`#${index + 1} - Sub ${row.subscription_id}:`);
      console.log(`  Product: ${row.product_name}`);
      console.log(`  Country: ${row.country_code}`);
      console.log(`  Source: ${row.source || '(NULL)'}`);
      console.log(`  Campaign: ${row.campaign_id || '(NO TRACKING)'}`);
      console.log(`  Adset: ${row.adset_id || '(NULL)'}`);
      console.log(`  Ad: ${row.ad_id || '(NULL)'}`);

      const issues: string[] = [];
      if (!row.campaign_id) issues.push('NO CAMPAIGN ID');
      if (!row.source) issues.push('NO SOURCE');
      if (!row.invoice_id) issues.push('NO INVOICE');
      if (row.invoice_tag && row.invoice_tag.includes('parent-sub-id=')) issues.push('UPSELL TAG (excluded from trials)');

      if (issues.length > 0) {
        console.log(`  ⚠️  ${issues.join(', ')}`);
      }
      console.log('');
    });

    // Summary for user's question
    console.log('\n💡 Analysis:');
    console.log(`  User reports seeing:`);
    console.log(`    - 19 total (18 Denmark + 1 Sweden) in CRM`);
    console.log(`    - 18 in Dashboard`);
    console.log(`    - 14 in Marketing Report`);
    console.log('');
    console.log(`  Actual database on Feb 10:`);
    console.log(`    - ${results.length} total subscriptions`);

    const dnkCount = results.filter(r => r.country_code === 'DK' && r.product_name?.includes('Hormonelle')).length;
    const sweCount = results.filter(r => r.country_code === 'SE' && r.product_name?.includes('Hormonelle')).length;

    console.log(`    - DK: ${dnkCount}`);
    console.log(`    - SE: ${sweCount}`);

    if (results.length !== 19) {
      console.log(`\n⚠️  Database count (${results.length}) doesn't match CRM report (19)`);
      console.log(`   Possible reasons:`);
      console.log(`   1. User is viewing a different date range`);
      console.log(`   2. User is viewing aggregated data across multiple days`);
      console.log(`   3. CRM interface includes deleted subscriptions`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

debugHormonelleByCampaign()
  .then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Debug failed:', error);
    process.exit(1);
  });
