#!/usr/bin/env node
/**
 * Debug script to find the missing DrCash trial for Balansera-dnk-x3-[166/996]
 *
 * Investigation: Dashboard shows 1 DrCash trial but CRM shows 2
 * Hypothesis: One trial has a parent-sub-id tag and is being filtered by upsell exclusion
 *
 * Usage: npx tsx scripts/debug-drcash-trial.ts
 */

import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

interface TrialInvoice {
  invoice_id: number;
  order_date: string;
  customer_email: string;
  product_name: string;
  source: string;
  tag: string | null;
  status: number;
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

async function debugDrCashTrial() {
  const pool = createMariaPool();

  try {
    console.log('🔍 Searching for DrCash trials for Balansera-dnk-x3-[166/996]...\n');

    // Query to find all trial invoices for this product from DrCash source
    // Using today's date (2026-02-10) as the likely range
    const query = `
      SELECT
        i.id AS invoice_id,
        DATE(i.order_date) AS order_date,
        c.email AS customer_email,
        p.product_name,
        sr.source,
        i.tag,
        i.status
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
      WHERE p.product_name = ?
        AND sr.source = ?
        AND DATE(i.order_date) BETWEEN DATE_SUB(?, INTERVAL 30 DAY) AND ?
      ORDER BY i.order_date DESC, i.id DESC
    `;

    const productName = 'Balansera-dnk-x3-[166/996]';
    const source = 'Drcash';
    const date = '2026-02-10';

    console.log(`Searching for:`);
    console.log(`  Product: ${productName}`);
    console.log(`  Source: ${source}`);
    console.log(`  Date range: Last 30 days up to ${date}\n`);

    const [rows] = await pool.execute(query, [productName, source, date, date]);
    const results = rows as TrialInvoice[];

    console.log(`Found ${results.length} DrCash trial(s) for this product:\n`);

    if (results.length === 0) {
      console.log('⚠️  No trials found. Possible reasons:');
      console.log('   - Wrong date range (try checking the actual date in Dashboard)');
      console.log('   - Product name mismatch');
      console.log('   - Source name mismatch');
      return;
    }

    results.forEach((trial, index) => {
      const hasUpsellTag = trial.tag?.includes('parent-sub-id=') ?? false;
      const approved = [2, 3, 4].includes(trial.status);

      console.log(`Trial #${index + 1}:`);
      console.log(`  Invoice ID: ${trial.invoice_id}`);
      console.log(`  Order Date: ${trial.order_date}`);
      console.log(`  Customer: ${trial.customer_email}`);
      console.log(`  Product: ${trial.product_name}`);
      console.log(`  Source: ${trial.source}`);
      console.log(`  Tag: ${trial.tag || '(null)'}`);
      console.log(`  Has Upsell Tag: ${hasUpsellTag ? 'YES ⚠️' : 'NO'}`);
      console.log(`  Approved: ${approved ? 'YES' : 'NO'}`);
      console.log('');
    });

    const withUpsellTag = results.filter(r => r.tag?.includes('parent-sub-id='));
    const withoutUpsellTag = results.filter(r => !r.tag?.includes('parent-sub-id='));

    console.log('📊 Summary:');
    console.log(`  Total DrCash trials: ${results.length}`);
    console.log(`  Without upsell tag (shown in Dashboard): ${withoutUpsellTag.length}`);
    console.log(`  With upsell tag (filtered out by Dashboard): ${withUpsellTag.length}`);
    console.log('');

    if (withUpsellTag.length > 0) {
      console.log('✅ FOUND THE ISSUE!');
      console.log('The following trial(s) have parent-sub-id tag and are excluded from Dashboard:');
      withUpsellTag.forEach(trial => {
        console.log(`  - Invoice #${trial.invoice_id}: ${trial.customer_email}`);
        console.log(`    Tag: ${trial.tag}`);
      });
      console.log('');
      console.log('💡 This explains why Dashboard shows 1 trial instead of 2.');
      console.log('   The upsell exclusion filter is working as designed to prevent double-counting.');
    } else {
      console.log('🤔 No upsell tags found. The discrepancy might be due to:');
      console.log('   - Different date ranges between CRM and Dashboard');
      console.log('   - Different source matching logic');
      console.log('   - Subscription deletion status (s.deleted field)');
    }
  } catch (error) {
    console.error('❌ Error running diagnostic query:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the diagnostic
debugDrCashTrial()
  .then(() => {
    console.log('\n✅ Diagnostic complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnostic failed:', error);
    process.exit(1);
  });
