#!/usr/bin/env node
/**
 * Search for Hormonelle subscriptions in a wider date range
 * to find the 19 subscriptions user is seeing
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

async function debugHormonelleWide() {
  const pool = createMariaPool();

  try {
    console.log('🔍 Searching for Hormonelle subscriptions in February 2026\n');

    // Get all Hormonelle subscriptions in February
    const query = `
      SELECT
        s.id AS subscription_id,
        DATE(s.date_create) AS subscription_date,
        s.tracking_id_4 AS campaign_id,
        c.country_code,
        sr.source,
        i.id AS invoice_id,
        i.tag AS invoice_tag,
        s.deleted AS subscription_deleted,
        i.deleted AS invoice_deleted,
        p.product_name
      FROM subscription s
      INNER JOIN customer c ON c.id = s.customer_id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      WHERE s.date_create >= '2026-02-01' AND s.date_create < '2026-03-01'
        AND EXISTS (
          SELECT 1 FROM invoice_product ip2
          INNER JOIN product p2 ON p2.id = ip2.product_id
          WHERE ip2.invoice_id = i.id AND p2.product_name LIKE 'Hormonelle%'
        )
      ORDER BY s.date_create DESC, s.id
    `;

    const [rows] = await pool.execute(query, []);
    const results = rows as any[];

    console.log(`Found ${results.length} Hormonelle subscription(s) in February 2026:\n`);

    // Group by date
    const byDate = new Map<string, any[]>();
    results.forEach((row) => {
      const dateStr = row.subscription_date.toISOString().split('T')[0];
      if (!byDate.has(dateStr)) {
        byDate.set(dateStr, []);
      }
      byDate.get(dateStr)!.push(row);
    });

    console.log('📊 By Date:');
    for (const [date, subs] of Array.from(byDate.entries()).sort().reverse()) {
      const dnk = subs.filter(s => s.country_code === 'DK').length;
      const swe = subs.filter(s => s.country_code === 'SE').length;
      console.log(`  ${date}: ${subs.length} (DK: ${dnk}, SE: ${swe})`);
    }
    console.log('');

    // Check if any date has 19 subscriptions
    const datesWithMany = Array.from(byDate.entries())
      .filter(([_, subs]) => subs.length >= 19)
      .map(([date, subs]) => ({ date, count: subs.length }));

    if (datesWithMany.length > 0) {
      console.log('📌 Dates with 19+ subscriptions:');
      datesWithMany.forEach(({ date, count }) => {
        console.log(`  ${date}: ${count}`);
      });
      console.log('');
    }

    // Check Feb 9-10 combined
    const feb9 = results.filter(r => r.subscription_date.toISOString().startsWith('2026-02-09'));
    const feb10 = results.filter(r => r.subscription_date.toISOString().startsWith('2026-02-10'));
    const feb9_10Combined = [...feb9, ...feb10];

    console.log('📊 Feb 9-10 Combined:');
    console.log(`  Total: ${feb9_10Combined.length}`);
    console.log(`  Feb 9: ${feb9.length}`);
    console.log(`  Feb 10: ${feb10.length}`);

    const dnk9_10 = feb9_10Combined.filter(s => s.country_code === 'DK').length;
    const swe9_10 = feb9_10Combined.filter(s => s.country_code === 'SE').length;
    console.log(`  DK: ${dnk9_10}`);
    console.log(`  SE: ${swe9_10}`);
    console.log('');

    // Group by product
    const byProduct = new Map<string, any[]>();
    feb9_10Combined.forEach((row) => {
      const product = row.product_name || '(NULL)';
      if (!byProduct.has(product)) {
        byProduct.set(product, []);
      }
      byProduct.get(product)!.push(row);
    });

    console.log('📊 Feb 9-10 By Product:');
    for (const [product, subs] of byProduct.entries()) {
      const dnk = subs.filter(s => s.country_code === 'DK').length;
      const swe = subs.filter(s => s.country_code === 'SE').length;
      const eligible = subs.filter(s =>
        !s.subscription_deleted &&
        (!s.invoice_deleted || s.invoice_deleted === 0) &&
        s.invoice_id &&
        (!s.invoice_tag || !s.invoice_tag.includes('parent-sub-id='))
      ).length;
      console.log(`  ${product}:`);
      console.log(`    Total: ${subs.length} (DK: ${dnk}, SE: ${swe})`);
      console.log(`    Eligible (not deleted, has invoice, no upsell): ${eligible}`);
    }
    console.log('');

    // Show all Feb 9-10 subscriptions
    console.log('📋 All Feb 9-10 Subscriptions:\n');
    feb9_10Combined.forEach((row, index) => {
      console.log(`#${index + 1} - ${row.subscription_date.toISOString().split('T')[0]} - Sub ${row.subscription_id}:`);
      console.log(`  Product: ${row.product_name}`);
      console.log(`  Country: ${row.country_code}`);
      console.log(`  Source: ${row.source || '(NULL)'}`);
      console.log(`  Campaign: ${row.campaign_id || '(NULL)'}`);

      const issues: string[] = [];
      if (!row.campaign_id) issues.push('NO CAMPAIGN');
      if (!row.source) issues.push('NO SOURCE');
      if (!row.invoice_id) issues.push('NO INVOICE');
      if (row.subscription_deleted) issues.push('SUB DELETED');
      if (row.invoice_deleted) issues.push('INV DELETED');
      if (row.invoice_tag && row.invoice_tag.includes('parent-sub-id=')) issues.push('UPSELL');

      if (issues.length > 0) {
        console.log(`  ⚠️  ${issues.join(', ')}`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

debugHormonelleWide()
  .then(() => {
    console.log('✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Debug failed:', error);
    process.exit(1);
  });
