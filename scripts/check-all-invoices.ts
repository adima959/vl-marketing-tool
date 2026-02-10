#!/usr/bin/env node
/**
 * Check ALL invoices (not just type=1) for the two subscriptions
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

async function checkAllInvoices() {
  const pool = createMariaPool();

  try {
    console.log('🔍 Checking ALL invoices for subscription 318010 (Tove - Feb 09)...\n');

    const query = `
      SELECT
        i.id AS invoice_id,
        i.type AS invoice_type,
        i.order_date,
        DATE(i.order_date) AS order_date_only,
        i.status,
        i.deleted,
        i.tag,
        p.product_name
      FROM invoice i
      LEFT JOIN (
        SELECT invoice_id, MIN(product_id) as product_id
        FROM invoice_product
        GROUP BY invoice_id
      ) ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      WHERE i.subscription_id = 318010
      ORDER BY i.order_date DESC
    `;

    const [rows] = await pool.execute(query, []);
    const results = rows as any[];

    console.log(`Found ${results.length} invoice(s) for subscription 318010:\n`);

    results.forEach((row, index) => {
      console.log(`Invoice #${index + 1}:`);
      console.log(`  Invoice ID: ${row.invoice_id}`);
      console.log(`  Type: ${row.invoice_type} (1=trial, 2=regular, 3=upsell)`);
      console.log(`  Order Date: ${row.order_date}`);
      console.log(`  Status: ${row.status}`);
      console.log(`  Deleted: ${row.deleted ? 'YES' : 'NO'}`);
      console.log(`  Tag: ${row.tag || '(null)'}`);
      console.log(`  Product: ${row.product_name || '(none)'}`);
      console.log('');
    });

    // Check if any invoice was created today
    const todayInvoices = results.filter(r => {
      const date = new Date(r.order_date);
      return date.getFullYear() === 2026 &&
             date.getMonth() === 1 &&
             date.getDate() === 10;
    });

    if (todayInvoices.length > 0) {
      console.log('⚠️  Found invoice(s) created TODAY for the Feb 09 subscription:');
      todayInvoices.forEach(inv => {
        console.log(`  - Invoice ${inv.invoice_id} (type ${inv.invoice_type}) created ${inv.order_date}`);
      });
    } else {
      console.log('✅ No invoices created today for this subscription');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkAllInvoices()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });
