/**
 * Debug script to understand invoice deletion patterns
 * Run with: npx tsx scripts/debug-invoice-deleted.ts
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUB_IDS = [317629, 317632, 317634];

async function main() {
  console.log('='.repeat(80));
  console.log('INVOICE DELETION ANALYSIS');
  console.log('='.repeat(80));

  const pool = await mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
  });

  try {
    // Check all invoices for these subscriptions including all types
    console.log('\n📊 All invoices for these subscriptions (all types, all statuses):');
    console.log('-'.repeat(60));

    const [allInvoices] = await pool.execute(`
      SELECT
        i.id as invoice_id,
        i.subscription_id,
        i.type,
        i.deleted,
        i.is_marked,
        i.status,
        i.tag
      FROM invoice i
      WHERE i.subscription_id IN (${SUB_IDS.join(',')})
      ORDER BY i.subscription_id, i.type, i.id
    `);

    console.log(`Total invoices: ${(allInvoices as any[]).length}`);
    (allInvoices as any[]).forEach((inv: any) => {
      console.log(`\n  Invoice ${inv.invoice_id} (Sub: ${inv.subscription_id})`);
      console.log(`    type: ${inv.type}, deleted: ${inv.deleted}, status: ${inv.status}, is_marked: ${inv.is_marked}`);
    });

    // Check subscription status
    console.log('\n📊 Subscription details:');
    console.log('-'.repeat(60));

    const [subDetails] = await pool.execute(`
      SELECT
        s.id,
        s.deleted,
        s.status
      FROM subscription s
      WHERE s.id IN (${SUB_IDS.join(',')})
    `);

    (subDetails as any[]).forEach((s: any) => {
      console.log(`  Subscription ${s.id}: deleted=${s.deleted}, status=${s.status}`);
    });

    // Compare with a working campaign
    console.log('\n📊 Compare with working campaign (6976485862382 - has 5 subs in report):');
    console.log('-'.repeat(60));

    const [workingSubs] = await pool.execute(`
      SELECT
        s.id as subscription_id,
        s.deleted as sub_deleted,
        s.status as sub_status
      FROM subscription s
      WHERE s.tracking_id_4 = '6976485862382'
        AND s.tracking_id_2 = '6976485862182'
        AND s.tracking_id = '6976485863382'
        AND s.date_create BETWEEN '2026-02-01 00:00:00' AND '2026-02-02 23:59:59'
    `);

    console.log(`Found ${(workingSubs as any[]).length} subscriptions`);
    const workingSubIds = (workingSubs as any[]).map((s: any) => s.subscription_id);

    if (workingSubIds.length > 0) {
      const [workingInvoices] = await pool.execute(`
        SELECT
          i.id as invoice_id,
          i.subscription_id,
          i.type,
          i.deleted,
          i.status
        FROM invoice i
        WHERE i.subscription_id IN (${workingSubIds.join(',')})
          AND i.type = 1
        ORDER BY i.subscription_id
      `);

      console.log(`Found ${(workingInvoices as any[]).length} type-1 invoices:`);
      (workingInvoices as any[]).forEach((inv: any) => {
        const status = inv.deleted === 0 ? '✓ NOT deleted' : '✗ DELETED';
        console.log(`  Invoice ${inv.invoice_id} (Sub: ${inv.subscription_id}): deleted=${inv.deleted} ${status}`);
      });
    }

    // Summary
    console.log('\n📊 SUMMARY:');
    console.log('-'.repeat(60));
    console.log('Issue: All 3 invoices for the problem campaign have deleted=1');
    console.log('This is why CRM shows 0 - deleted invoices are excluded from counts.');
    console.log('\nPossible reasons:');
    console.log('  1. Trials were legitimately canceled/refunded');
    console.log('  2. Data sync issue caused invoices to be marked deleted');
    console.log('  3. Business process automatically deleted certain invoices');

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
