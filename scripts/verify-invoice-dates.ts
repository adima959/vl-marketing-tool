#!/usr/bin/env node
/**
 * Verify invoice dates vs subscription dates for the two DrCash subscriptions
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

async function verifyDates() {
  const pool = createMariaPool();

  try {
    console.log('🔍 Checking subscription dates vs invoice dates for tracking ID 157382...\n');

    const query = `
      SELECT
        s.id AS subscription_id,
        CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
        c.email,
        s.tracking_id,
        s.date_create AS subscription_created_at,
        DATE(s.date_create) AS subscription_date,
        i.id AS invoice_id,
        i.order_date AS invoice_created_at,
        DATE(i.order_date) AS invoice_date,
        i.type AS invoice_type,
        i.status AS invoice_status,
        i.deleted AS invoice_deleted,
        p.product_name,
        sr.source
      FROM subscription s
      INNER JOIN customer c ON c.id = s.customer_id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN (
        SELECT invoice_id, MIN(product_id) as product_id
        FROM invoice_product
        GROUP BY invoice_id
      ) ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE s.tracking_id = '157382'
        AND p.product_name LIKE '%Balansera%166%'
        AND DATE(s.date_create) >= '2026-02-09'
      ORDER BY s.date_create DESC
    `;

    const [rows] = await pool.execute(query, []);
    const results = rows as any[];

    console.log(`Found ${results.length} subscription(s):\n`);

    results.forEach((row, index) => {
      const subDate = row.subscription_date;
      const invDate = row.invoice_date;
      const dateMatch = subDate.getTime() === invDate.getTime();

      console.log(`Subscription #${index + 1}:`);
      console.log(`  Customer: ${row.customer_name} (${row.email})`);
      console.log(`  Subscription ID: ${row.subscription_id}`);
      console.log(`  Subscription Created: ${row.subscription_created_at}`);
      console.log(`  Subscription Date: ${subDate}`);
      console.log('');
      console.log(`  Invoice ID: ${row.invoice_id}`);
      console.log(`  Invoice Created: ${row.invoice_created_at}`);
      console.log(`  Invoice Date: ${invDate}`);
      console.log(`  Invoice Deleted: ${row.invoice_deleted ? 'YES' : 'NO'}`);
      console.log('');
      console.log(`  📅 Date Match: ${dateMatch ? 'YES ✅' : 'NO ⚠️  MISMATCH!'}`);
      if (!dateMatch) {
        console.log(`     → Subscription from ${subDate.toISOString().split('T')[0]}`);
        console.log(`     → Invoice recreated on ${invDate.toISOString().split('T')[0]}`);
      }
      console.log(`  Product: ${row.product_name}`);
      console.log(`  Source: ${row.source}`);
      console.log('');
    });

    // Now check what Dashboard would show (filter by subscription date = today)
    console.log('\n📊 Dashboard Filter (s.date_create = 2026-02-10):');
    const dashboardMatches = results.filter(r => {
      const subDate = r.subscription_date;
      return subDate.getFullYear() === 2026 &&
             subDate.getMonth() === 1 && // February (0-indexed)
             subDate.getDate() === 10;
    });
    console.log(`  Would show: ${dashboardMatches.length} subscription(s)`);
    dashboardMatches.forEach(r => {
      console.log(`    - ${r.customer_name} (Sub ID: ${r.subscription_id})`);
    });

    // Check what CRM "New Orders" would show (filter by invoice date = today)
    console.log('\n📊 CRM New Orders Filter (i.order_date = 2026-02-10):');
    const crmMatches = results.filter(r => {
      const invDate = r.invoice_date;
      return invDate.getFullYear() === 2026 &&
             invDate.getMonth() === 1 && // February (0-indexed)
             invDate.getDate() === 10;
    });
    console.log(`  Would show: ${crmMatches.length} trial(s)`);
    crmMatches.forEach(r => {
      console.log(`    - ${r.customer_name} (Invoice ID: ${r.invoice_id})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

verifyDates()
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });
