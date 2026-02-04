/**
 * Debug script to investigate invoice join issues
 * Run with: npx tsx scripts/debug-invoice-issue.ts
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const CAMPAIGN_ID = '6976227602382';
const ADSET_ID = '6976227602182';
const AD_ID = '6976229393982';
const DATE_START = '2026-02-01';
const DATE_END = '2026-02-02';

async function main() {
  console.log('='.repeat(80));
  console.log('INVOICE DEBUG - Investigating why subscriptions are not matching');
  console.log('='.repeat(80));

  const pool = await mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
  });

  try {
    // Step 1: Find all subscriptions with matching tracking IDs (without invoice join)
    console.log('\n📊 STEP 1: Find ALL subscriptions with matching tracking IDs (no invoice filter)');
    console.log('-'.repeat(60));

    const [subs] = await pool.execute(`
      SELECT
        s.id as subscription_id,
        s.tracking_id_4 as campaign_id,
        s.tracking_id_2 as adset_id,
        s.tracking_id as ad_id,
        s.date_create,
        s.deleted as sub_deleted,
        s.source_id,
        sr.source
      FROM subscription s
      LEFT JOIN source sr ON sr.id = s.source_id
      WHERE s.tracking_id_4 = ?
        AND s.tracking_id_2 = ?
        AND s.tracking_id = ?
        AND s.date_create BETWEEN ? AND ?
      ORDER BY s.date_create
    `, [CAMPAIGN_ID, ADSET_ID, AD_ID, `${DATE_START} 00:00:00`, `${DATE_END} 23:59:59`]);

    console.log(`Found ${(subs as any[]).length} subscriptions:`);
    const subIds = (subs as any[]).map((s: any) => {
      console.log(`  - ID: ${s.subscription_id}`);
      console.log(`    date_create: ${s.date_create}`);
      console.log(`    deleted: ${s.sub_deleted}`);
      console.log(`    source: "${s.source}"`);
      return s.subscription_id;
    });

    if (subIds.length === 0) {
      console.log('No subscriptions found. This should not happen!');
      return;
    }

    // Step 2: Check invoices for these subscriptions
    console.log('\n📊 STEP 2: Check ALL invoices for these subscriptions');
    console.log('-'.repeat(60));

    const [invoices] = await pool.execute(`
      SELECT
        i.id as invoice_id,
        i.subscription_id,
        i.type,
        i.deleted as inv_deleted,
        i.is_marked,
        i.tag
      FROM invoice i
      WHERE i.subscription_id IN (${subIds.join(',')})
      ORDER BY i.subscription_id, i.id
    `);

    console.log(`Found ${(invoices as any[]).length} invoices:`);
    (invoices as any[]).forEach((inv: any) => {
      console.log(`\n  Invoice ID: ${inv.invoice_id} (Subscription: ${inv.subscription_id})`);
      console.log(`    type: ${inv.type} ${inv.type === 1 ? '✓' : '✗ (type must be 1)'}`);
      console.log(`    deleted: ${inv.inv_deleted} ${inv.inv_deleted === 0 ? '✓' : '✗ (must be 0)'}`);
      console.log(`    is_marked: ${inv.is_marked}`);
      console.log(`    tag: "${inv.tag || 'NULL'}" ${!inv.tag || !inv.tag.includes('parent-sub-id=') ? '✓' : '✗ (has parent-sub-id)'}`);
    });

    // Step 3: Run the exact query from CRM matching
    console.log('\n📊 STEP 3: Run the EXACT query from getCRMSubscriptions()');
    console.log('-'.repeat(60));

    const [crmResult] = await pool.execute(`
      SELECT
        sr.source,
        s.tracking_id_4 as campaign_id,
        s.tracking_id_2 as adset_id,
        s.tracking_id as ad_id,
        DATE(s.date_create) as date,
        p.product_name,
        COUNT(DISTINCT s.id) as subscription_count,
        COUNT(DISTINCT CASE WHEN i.is_marked = 1 AND i.deleted = 0 THEN i.id END) as approved_count
      FROM subscription s
      INNER JOIN invoice i ON i.subscription_id = s.id
        AND i.type = 1
      LEFT JOIN source sr ON sr.id = s.source_id
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      WHERE s.tracking_id_4 = ?
        AND s.tracking_id_2 = ?
        AND s.tracking_id = ?
        AND s.date_create BETWEEN ? AND ?
        AND s.deleted = 0
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      GROUP BY sr.source, s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create), p.product_name
    `, [CAMPAIGN_ID, ADSET_ID, AD_ID, `${DATE_START} 00:00:00`, `${DATE_END} 23:59:59`]);

    console.log(`CRM query result: ${(crmResult as any[]).length} rows`);
    (crmResult as any[]).forEach((r: any) => {
      console.log(`  - source: "${r.source}", subs: ${r.subscription_count}, approved: ${r.approved_count}, product: ${r.product_name}`);
    });

    // Step 4: Check without tag filter
    console.log('\n📊 STEP 4: Run query WITHOUT tag filter');
    console.log('-'.repeat(60));

    const [noTagResult] = await pool.execute(`
      SELECT
        sr.source,
        s.tracking_id_4 as campaign_id,
        s.tracking_id_2 as adset_id,
        s.tracking_id as ad_id,
        DATE(s.date_create) as date,
        p.product_name,
        COUNT(DISTINCT s.id) as subscription_count,
        COUNT(DISTINCT CASE WHEN i.is_marked = 1 AND i.deleted = 0 THEN i.id END) as approved_count
      FROM subscription s
      INNER JOIN invoice i ON i.subscription_id = s.id
        AND i.type = 1
      LEFT JOIN source sr ON sr.id = s.source_id
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      WHERE s.tracking_id_4 = ?
        AND s.tracking_id_2 = ?
        AND s.tracking_id = ?
        AND s.date_create BETWEEN ? AND ?
        AND s.deleted = 0
      GROUP BY sr.source, s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create), p.product_name
    `, [CAMPAIGN_ID, ADSET_ID, AD_ID, `${DATE_START} 00:00:00`, `${DATE_END} 23:59:59`]);

    console.log(`Without tag filter: ${(noTagResult as any[]).length} rows`);
    (noTagResult as any[]).forEach((r: any) => {
      console.log(`  - source: "${r.source}", subs: ${r.subscription_count}, approved: ${r.approved_count}, product: ${r.product_name}`);
    });

    // Step 5: Check invoice type distribution
    console.log('\n📊 STEP 5: Invoice type distribution for these subscriptions');
    console.log('-'.repeat(60));

    const [typeDistribution] = await pool.execute(`
      SELECT
        i.type,
        COUNT(*) as count
      FROM invoice i
      WHERE i.subscription_id IN (${subIds.join(',')})
      GROUP BY i.type
      ORDER BY i.type
    `);

    console.log('Invoice types:');
    (typeDistribution as any[]).forEach((t: any) => {
      console.log(`  Type ${t.type}: ${t.count} invoice(s)`);
    });

    // Step 6: Check the source matching
    console.log('\n📊 STEP 6: Check source values in detail');
    console.log('-'.repeat(60));

    const [sourceCheck] = await pool.execute(`
      SELECT
        s.id,
        s.source_id,
        sr.source,
        sr.id as source_table_id
      FROM subscription s
      LEFT JOIN source sr ON sr.id = s.source_id
      WHERE s.tracking_id_4 = ?
        AND s.date_create BETWEEN ? AND ?
    `, [CAMPAIGN_ID, `${DATE_START} 00:00:00`, `${DATE_END} 23:59:59`]);

    console.log('Source details:');
    (sourceCheck as any[]).forEach((s: any) => {
      console.log(`  Subscription ${s.id}: source_id=${s.source_id}, source="${s.source}"`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('DEBUG COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
