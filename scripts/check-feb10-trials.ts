#!/usr/bin/env node
/**
 * Check ALL trial invoices with order_date = Feb 10 for Balansera product
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

async function checkTrials() {
  const pool = createMariaPool();

  try {
    console.log('🔍 Checking ALL trial invoices with order_date = 2026-02-10 for Balansera...\n');

    const query = `
      SELECT
        i.id AS invoice_id,
        DATE(i.order_date) AS invoice_date,
        s.id AS subscription_id,
        DATE(s.date_create) AS subscription_date,
        CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
        c.email,
        s.tracking_id,
        p.product_name,
        sr.source
      FROM invoice i
      INNER JOIN subscription s ON s.id = i.subscription_id
      INNER JOIN customer c ON c.id = s.customer_id
      LEFT JOIN (
        SELECT invoice_id, MIN(product_id) as product_id
        FROM invoice_product
        GROUP BY invoice_id
      ) ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE i.type = 1
        AND DATE(i.order_date) = '2026-02-10'
        AND p.product_name LIKE '%Balansera%166%'
        AND sr.source = 'DrCash'
      ORDER BY i.id
    `;

    const [rows] = await pool.execute(query, []);
    const results = rows as any[];

    console.log(`Found ${results.length} trial invoice(s) with order_date = Feb 10:\n`);

    results.forEach((row, index) => {
      console.log(`Trial #${index + 1}:`);
      console.log(`  Invoice ID: ${row.invoice_id}`);
      console.log(`  Invoice Date: ${row.invoice_date}`);
      console.log(`  Subscription ID: ${row.subscription_id}`);
      console.log(`  Subscription Date: ${row.subscription_date}`);
      console.log(`  Customer: ${row.customer_name} (${row.email})`);
      console.log(`  Tracking ID: ${row.tracking_id}`);
      console.log(`  Product: ${row.product_name}`);
      console.log(`  Source: ${row.source}`);
      console.log('');
    });

    console.log(`\n📊 Summary:`);
    console.log(`  Dashboard filter (s.date_create = Feb 10) would show: ${results.filter(r => {
      const subDate = new Date(r.subscription_date);
      return subDate.getFullYear() === 2026 && subDate.getMonth() === 1 && subDate.getDate() === 10;
    }).length} trial(s)`);
    console.log(`  CRM filter (i.order_date = Feb 10) shows: ${results.length} trial(s)`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkTrials()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });
