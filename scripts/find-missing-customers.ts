#!/usr/bin/env node
/**
 * Find specific customers mentioned in CRM interface
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

async function findCustomers() {
  const pool = createMariaPool();

  try {
    console.log('🔍 Searching for Kirsten Sørensen and Vibeke Johansen...\n');

    // Search by customer name pattern
    const query = `
      SELECT
        c.id AS customer_id,
        CONCAT(c.first_name, ' ', c.last_name) AS name,
        c.email,
        s.id AS subscription_id,
        s.tracking_id,
        DATE(s.date_create) AS subscription_date,
        s.deleted,
        i.id AS invoice_id,
        i.type AS invoice_type,
        DATE(i.order_date) AS invoice_date,
        i.tag AS invoice_tag,
        i.status AS invoice_status,
        p.product_name,
        sr.source
      FROM customer c
      LEFT JOIN subscription s ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN (
        SELECT invoice_id, MIN(product_id) as product_id
        FROM invoice_product
        GROUP BY invoice_id
      ) ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE (c.first_name LIKE '%Kirsten%' OR c.first_name LIKE '%Vibeke%' OR c.last_name LIKE '%Sørensen%' OR c.last_name LIKE '%Johansen%' OR c.email LIKE '%kirsten%' OR c.email LIKE '%vibeke%')
        AND DATE(s.date_create) >= '2026-02-09'
      ORDER BY s.date_create DESC, c.id
    `;

    const [rows] = await pool.execute(query, []);
    const results = rows as any[];

    console.log(`Found ${results.length} records:\n`);

    results.forEach((row, index) => {
      console.log(`Record #${index + 1}:`);
      console.log(`  Customer: ${row.name} (${row.email})`);
      console.log(`  Subscription ID: ${row.subscription_id}`);
      console.log(`  Subscription Date: ${row.subscription_date}`);
      console.log(`  Tracking ID 1: ${row.tracking_id}`);
      console.log(`  Deleted: ${row.deleted ? 'YES ⚠️' : 'NO'}`);
      console.log(`  Invoice ID: ${row.invoice_id}`);
      console.log(`  Invoice Type: ${row.invoice_type} (1=trial, 2=regular)`);
      console.log(`  Invoice Date: ${row.invoice_date}`);
      console.log(`  Invoice Status: ${row.invoice_status}`);
      console.log(`  Invoice Tag: ${row.invoice_tag || '(null)'}`);
      console.log(`  Product: ${row.product_name}`);
      console.log(`  Source: ${row.source}`);
      console.log('');
    });

    // Also search by tracking ID 157382
    console.log('\n🔍 Searching by Tracking ID 157382...\n');

    const trackingQuery = `
      SELECT
        c.id AS customer_id,
        CONCAT(c.first_name, ' ', c.last_name) AS name,
        c.email,
        s.id AS subscription_id,
        s.tracking_id,
        DATE(s.date_create) AS subscription_date,
        s.deleted,
        i.id AS invoice_id,
        i.type AS invoice_type,
        DATE(i.order_date) AS invoice_date,
        i.tag AS invoice_tag,
        i.status AS invoice_status,
        p.product_name,
        sr.source
      FROM subscription s
      INNER JOIN customer c ON c.id = s.customer_id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN (
        SELECT invoice_id, MIN(product_id) as product_id
        FROM invoice_product
        GROUP BY invoice_id
      ) ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE s.tracking_id = '157382'
        AND DATE(s.date_create) >= '2026-02-09'
        AND p.product_name LIKE '%Balansera%166%'
      ORDER BY s.date_create DESC
    `;

    const [trackingRows] = await pool.execute(trackingQuery, []);
    const trackingResults = trackingRows as any[];

    console.log(`Found ${trackingResults.length} subscriptions with tracking ID 157382:\n`);

    trackingResults.forEach((row, index) => {
      const hasUpsellTag = row.invoice_tag?.includes('parent-sub-id=') ?? false;
      console.log(`Subscription #${index + 1}:`);
      console.log(`  Customer: ${row.name} (${row.email})`);
      console.log(`  Subscription ID: ${row.subscription_id}`);
      console.log(`  Subscription Date: ${row.subscription_date}`);
      console.log(`  Deleted: ${row.deleted ? 'YES ⚠️' : 'NO'}`);
      console.log(`  Invoice ID: ${row.invoice_id || '(none)'}`);
      console.log(`  Invoice Type: ${row.invoice_type || '(none)'}`);
      console.log(`  Invoice Date: ${row.invoice_date || '(none)'}`);
      console.log(`  Invoice Status: ${row.invoice_status || '(none)'}`);
      console.log(`  Invoice Tag: ${row.invoice_tag || '(null)'}`);
      console.log(`  Has Upsell Tag: ${hasUpsellTag ? 'YES ⚠️' : 'NO'}`);
      console.log(`  Product: ${row.product_name}`);
      console.log(`  Source: ${row.source || '(none)'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

findCustomers()
  .then(() => {
    console.log('\n✅ Search complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Search failed:', error);
    process.exit(1);
  });
