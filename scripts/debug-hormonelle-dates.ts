#!/usr/bin/env node
/**
 * Check Hormonelle subscriptions around Feb 10 with actual timestamps
 * Look for timezone or date range issues
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

async function debugHormonelleDates() {
  const pool = createMariaPool();

  try {
    console.log('🔍 Checking Hormonelle subscriptions around Feb 10 with timestamps\n');

    // Find all Hormonelle subscriptions in a wider date range
    const query = `
      SELECT
        s.id AS subscription_id,
        s.date_create AS subscription_datetime,
        DATE(s.date_create) AS subscription_date,
        s.tracking_id_4 AS campaign_id,
        c.country_code,
        sr.source,
        i.id AS invoice_id,
        p.product_name
      FROM subscription s
      INNER JOIN customer c ON c.id = s.customer_id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      WHERE s.date_create BETWEEN '2026-02-09 00:00:00' AND '2026-02-11 23:59:59'
        AND EXISTS (
          SELECT 1 FROM invoice_product ip2
          INNER JOIN product p2 ON p2.id = ip2.product_id
          WHERE ip2.invoice_id = i.id AND p2.product_name LIKE 'Hormonelle%'
        )
      ORDER BY s.date_create, s.id
    `;

    const [rows] = await pool.execute(query, []);
    const results = rows as any[];

    console.log(`Found ${results.length} Hormonelle subscription(s) between Feb 9-11:\n`);

    // Group by date
    const byDate = new Map<string, any[]>();
    results.forEach((row) => {
      const date = row.subscription_date;
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date)!.push(row);
    });

    console.log('📊 By Date:');
    for (const [date, subs] of Array.from(byDate.entries()).sort()) {
      console.log(`  ${date}: ${subs.length} subscriptions`);

      // Count by country for each date
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

    // Show all subscriptions with timestamps
    console.log('📋 All Subscriptions:\n');
    results.forEach((row, index) => {
      console.log(`#${index + 1} - Subscription ${row.subscription_id}:`);
      console.log(`  DateTime: ${row.subscription_datetime}`);
      console.log(`  Date: ${row.subscription_date}`);
      console.log(`  Country: ${row.country_code}`);
      console.log(`  Product: ${row.product_name}`);
      console.log(`  Source: ${row.source || '(NULL)'}`);
      console.log(`  Campaign ID: ${row.campaign_id || '(NULL)'}`);
      console.log(`  Invoice ID: ${row.invoice_id || '(NULL)'}`);
      console.log('');
    });

    // Check Feb 10 specifically
    const feb10 = results.filter(r => r.subscription_date === '2026-02-10');
    console.log(`\n💡 Feb 10 Summary:`);
    console.log(`  Total: ${feb10.length}`);

    const feb10ByCountry = new Map<string, number>();
    feb10.forEach(r => {
      const country = r.country_code || 'NULL';
      feb10ByCountry.set(country, (feb10ByCountry.get(country) || 0) + 1);
    });

    console.log(`  By country:`);
    for (const [country, count] of feb10ByCountry.entries()) {
      console.log(`    ${country}: ${count}`);
    }

    if (feb10.length !== 19) {
      console.log(`\n⚠️  User reports 19 total (18 DK + 1 SE), but database shows ${feb10.length}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

debugHormonelleDates()
  .then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Debug failed:', error);
    process.exit(1);
  });
