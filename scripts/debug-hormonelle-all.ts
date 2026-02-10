#!/usr/bin/env node
/**
 * Find ALL Hormonelle subscriptions for Feb 10
 * Check if there are multiple product variants
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

async function debugAllHormonelle() {
  const pool = createMariaPool();

  try {
    const date = '2026-02-10';

    console.log('🔍 Finding ALL Hormonelle products for Feb 10\n');

    // Find all Hormonelle subscriptions (any product starting with Hormonelle)
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
        DATE(s.date_create) AS subscription_date,
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
        AND EXISTS (
          SELECT 1 FROM invoice_product ip2
          INNER JOIN product p2 ON p2.id = ip2.product_id
          WHERE ip2.invoice_id = i.id AND p2.product_name LIKE 'Hormonelle%'
        )
      ORDER BY p.product_name, c.country_code, s.id
    `;

    const [rows] = await pool.execute(query, [date]);
    const results = rows as any[];

    console.log(`Found ${results.length} Hormonelle subscription(s) total:\n`);

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
      console.log(`  ${product}: ${subs.length} subscriptions`);

      // Count by country within each product
      const byCountry = new Map<string, number>();
      subs.forEach(s => {
        const country = s.country_code || 'NULL';
        byCountry.set(country, (byCountry.get(country) || 0) + 1);
      });

      for (const [country, count] of byCountry.entries()) {
        console.log(`    ${country}: ${count}`);
      }
    }
    console.log('');

    // Count by source
    console.log('📊 By Source:');
    const bySource = new Map<string, number>();
    results.forEach(r => {
      const source = r.source || '(NULL)';
      bySource.set(source, (bySource.get(source) || 0) + 1);
    });
    for (const [source, count] of bySource.entries()) {
      console.log(`  ${source}: ${count}`);
    }
    console.log('');

    // Count with/without tracking IDs
    const withTracking = results.filter(r => r.campaign_id);
    const withoutTracking = results.filter(r => !r.campaign_id);

    console.log('📊 Tracking Stats:');
    console.log(`  With campaign IDs: ${withTracking.length}`);
    console.log(`  Without campaign IDs: ${withoutTracking.length}`);
    console.log('');

    // Show all subscriptions grouped by product
    for (const [product, subs] of byProduct.entries()) {
      console.log(`\n📦 ${product} (${subs.length} subscriptions):\n`);

      subs.forEach((row, index) => {
        console.log(`  #${index + 1} - Sub ${row.subscription_id} (${row.country_code}):`);
        console.log(`    Source: ${row.source || '(NULL)'}`);
        console.log(`    Tracking: ${row.campaign_id || 'NO'}|${row.adset_id || 'NO'}|${row.ad_id || 'NO'}`);

        const issues: string[] = [];
        if (!row.campaign_id) issues.push('NO TRACKING');
        if (!row.source) issues.push('NO SOURCE');
        if (!row.invoice_id) issues.push('NO INVOICE');
        if (row.invoice_tag && row.invoice_tag.includes('parent-sub-id=')) issues.push('UPSELL TAG');
        if (row.subscription_deleted) issues.push('SUB DELETED');
        if (row.invoice_deleted) issues.push('INV DELETED');

        if (issues.length > 0) {
          console.log(`    ⚠️  ${issues.join(', ')}`);
        }
      });
    }

    // Summary
    console.log('\n\n💡 Summary:');
    console.log(`  Total Hormonelle subscriptions: ${results.length}`);
    console.log(`  Unique products: ${byProduct.size}`);

    const dashboardEligible = results.filter(r =>
      !r.subscription_deleted &&
      !r.invoice_deleted &&
      r.invoice_id &&
      (!r.invoice_tag || !r.invoice_tag.includes('parent-sub-id='))
    );

    const marketingEligible = results.filter(r =>
      !r.subscription_deleted &&
      !r.invoice_deleted &&
      r.invoice_id &&
      r.campaign_id &&
      r.source &&
      (!r.invoice_tag || !r.invoice_tag.includes('parent-sub-id='))
    );

    console.log(`  Dashboard eligible: ${dashboardEligible.length}`);
    console.log(`  Marketing eligible: ${marketingEligible.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

debugAllHormonelle()
  .then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Debug failed:', error);
    process.exit(1);
  });
