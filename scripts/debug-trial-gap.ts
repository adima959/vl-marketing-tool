/**
 * Debug: Investigate trial count discrepancy between CRM (749) and tool (647)
 * for Denmark, Jan 12 - Feb 9, 2026
 *
 * Run: npx tsx scripts/debug-trial-gap.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectTimeout: 15000,
});

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = params.length > 0
    ? await pool.execute(sql, params)
    : await pool.query(sql);
  return rows as T[];
}

const START = '2026-01-12 00:00:00';
const END = '2026-02-09 23:59:59';

async function main(): Promise<void> {
  console.log('=== TRIAL COUNT DIAGNOSTIC ===');
  console.log(`Date range: ${START} to ${END}`);
  console.log(`Country: Denmark\n`);

  // 1. Current tool logic: trial invoices from non-upsell subscriptions
  const toolTrials = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log(`1. Tool trial count (current):          ${toolTrials[0].cnt}`);

  // 2. Same but counting SUBSCRIPTIONS that have trial invoices (s.id instead of i.id)
  const toolTrialSubs = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT CASE WHEN i.type = 1 THEN s.id END) AS cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log(`2. Subs with trial invoices (s.id):     ${toolTrialSubs[0].cnt}`);

  // 3. Without upsell exclusion (all subs)
  const noUpsellFilter = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
  `, [START, END]);
  console.log(`3. Trials without upsell exclusion:     ${noUpsellFilter[0].cnt}`);

  // 4. Including deleted trial invoices
  const withDeleted = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log(`4. Trials incl. deleted invoices:       ${withDeleted[0].cnt}`);

  // 5. Using i.tag filter instead of s.tag (per business rules doc)
  const iTagFilter = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  console.log(`5. Trials with i.tag filter:            ${iTagFilter[0].cnt}`);

  // 6. No upsell filter AND including deleted invoices
  const noFilterNoDeleted = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
  `, [START, END]);
  console.log(`6. All trials (no upsell, incl del):    ${noFilterNoDeleted[0].cnt}`);

  // 7. Count subs that have ANY type=1 invoice (incl deleted), no upsell filter
  const subsWithAnyTrialInvoice = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT s.id) AS cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
  `, [START, END]);
  console.log(`7. Subs with ANY trial invoice:         ${subsWithAnyTrialInvoice[0].cnt}`);

  // 8. Count subs that have ANY type=1 invoice (non-deleted only), no upsell filter
  const subsWithNonDelTrialInvoice = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT s.id) AS cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
  `, [START, END]);
  console.log(`8. Subs with non-del trial invoice:     ${subsWithNonDelTrialInvoice[0].cnt}`);

  // 9. Breakdown: how many subs have 0, 1, 2+ trial invoices
  const invoiceDistribution = await query<{ trial_invoice_count: number; sub_count: number }>(`
    SELECT trial_invoice_count, COUNT(*) AS sub_count
    FROM (
      SELECT s.id, COUNT(CASE WHEN i.type = 1 AND i.deleted = 0 THEN i.id END) AS trial_invoice_count
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      WHERE s.date_create BETWEEN ? AND ?
        AND c.country = 'Denmark'
        AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      GROUP BY s.id
    ) sub_trials
    GROUP BY trial_invoice_count
    ORDER BY trial_invoice_count
  `, [START, END]);
  console.log(`\n=== INVOICE DISTRIBUTION (non-upsell subs) ===`);
  for (const row of invoiceDistribution) {
    console.log(`  ${row.trial_invoice_count} trial invoices: ${row.sub_count} subscriptions`);
  }

  // 10. How many upsell subs have trial invoices?
  const upsellTrials = await query<{ total_upsell_subs: number; with_trial: number }>(`
    SELECT
      COUNT(DISTINCT s.id) AS total_upsell_subs,
      COUNT(DISTINCT CASE WHEN i.type = 1 AND i.deleted = 0 THEN s.id END) AS with_trial
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND s.tag LIKE '%parent-sub-id=%'
  `, [START, END]);
  console.log(`\n=== UPSELL SUBSCRIPTIONS ===`);
  console.log(`  Total upsell subs:     ${upsellTrials[0].total_upsell_subs}`);
  console.log(`  With trial invoices:   ${upsellTrials[0].with_trial}`);

  // 11. Subs with deleted trial invoices (but no non-deleted ones)
  const deletedOnly = await query<{ cnt: number }>(`
    SELECT COUNT(DISTINCT s.id) AS cnt
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND EXISTS (SELECT 1 FROM invoice i WHERE i.subscription_id = s.id AND i.type = 1 AND i.deleted = 1)
      AND NOT EXISTS (SELECT 1 FROM invoice i WHERE i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0)
  `, [START, END]);
  console.log(`\n=== DELETED TRIAL INVOICES ===`);
  console.log(`  Subs with ONLY deleted trial invoices: ${deletedOnly[0].cnt}`);

  // 12. Total subscription count checks
  const subCounts = await query<{ total: number; non_upsell: number; upsell: number }>(`
    SELECT
      COUNT(DISTINCT s.id) AS total,
      COUNT(DISTINCT CASE WHEN (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%') THEN s.id END) AS non_upsell,
      COUNT(DISTINCT CASE WHEN s.tag LIKE '%parent-sub-id=%' THEN s.id END) AS upsell
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
  `, [START, END]);
  console.log(`\n=== SUBSCRIPTION COUNTS ===`);
  console.log(`  Total:      ${subCounts[0].total}`);
  console.log(`  Non-upsell: ${subCounts[0].non_upsell}`);
  console.log(`  Upsell:     ${subCounts[0].upsell}`);

  console.log('\n=== SUMMARY ===');
  console.log(`CRM says:  749 trials`);
  console.log(`Tool says: 647 trials`);
  console.log(`Gap:       ${749 - 647} trials`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});
