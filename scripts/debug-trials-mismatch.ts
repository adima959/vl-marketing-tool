/**
 * Debug: Why CRM shows 854 trials but dashboard shows 730 (Denmark, 2026-02-16)
 *
 * Approach:
 * 1. Load the 854 subscription IDs from the CRM CSV
 * 2. Check each one in DB: is it upsell-tagged? does it have a trial invoice?
 * 3. Categorize the gap
 */

import * as fs from 'fs';
import * as path from 'path';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

const CSV_PATH = path.join(__dirname, 'debug-trials-mismatch.csv');

async function main() {
  // Parse CSV
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.trim().split('\n').slice(1); // skip header
  const subIds = lines.map((l) => {
    const parts = l.split(',');
    return Number(parts[1].trim());
  });

  console.log(`CSV contains ${subIds.length} subscription IDs`);

  const conn = await mysql.createConnection({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    connectTimeout: 30000,
  });

  // Check all subscription IDs at once
  const placeholders = subIds.map(() => '?').join(',');

  // Get subscription details: tag, country, trial invoice info
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
       s.id AS sub_id,
       s.tag,
       (s.tag IS NOT NULL AND s.tag LIKE '%parent-sub-id=%') AS is_upsell_sub,
       c.country,
       i.id AS trial_invoice_id,
       i.type AS invoice_type,
       i.deleted AS invoice_deleted
     FROM subscription s
     LEFT JOIN customer c ON c.id = s.customer_id
     LEFT JOIN invoice i ON i.id = (
       SELECT MIN(i2.id) FROM invoice i2
       WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
     )
     WHERE s.id IN (${placeholders})`,
    subIds,
  );

  console.log(`Found ${rows.length} subscriptions in DB out of ${subIds.length}`);

  // Categorize
  let upsellSubs = 0;
  let noTrialInvoice = 0;
  let withTrial = 0;
  let notFound = 0;

  const foundIds = new Set(rows.map((r: mysql.RowDataPacket) => Number(r.sub_id)));
  const missingIds = subIds.filter((id) => !foundIds.has(id));
  notFound = missingIds.length;

  const upsellSubIds: number[] = [];
  const noTrialIds: number[] = [];

  const countryCounts: Record<string, { total: number; upsell: number; noTrial: number; withTrial: number }> = {};

  for (const row of rows) {
    const country = String(row.country || 'Unknown');
    if (!countryCounts[country]) {
      countryCounts[country] = { total: 0, upsell: 0, noTrial: 0, withTrial: 0 };
    }
    countryCounts[country].total++;

    if (Number(row.is_upsell_sub)) {
      upsellSubs++;
      upsellSubIds.push(Number(row.sub_id));
      countryCounts[country].upsell++;
    } else if (!row.trial_invoice_id) {
      noTrialInvoice++;
      noTrialIds.push(Number(row.sub_id));
      countryCounts[country].noTrial++;
    } else {
      withTrial++;
      countryCounts[country].withTrial++;
    }
  }

  console.log('\n--- BREAKDOWN ---');
  console.log(`Total in CSV:        ${subIds.length}`);
  console.log(`Found in DB:         ${rows.length}`);
  console.log(`Not found in DB:     ${notFound}`);
  console.log(`Upsell subs:         ${upsellSubs}`);
  console.log(`No trial invoice:    ${noTrialInvoice}`);
  console.log(`With trial invoice:  ${withTrial} (= dashboard "Trials")`);

  console.log('\n--- BY COUNTRY ---');
  for (const [country, counts] of Object.entries(countryCounts).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`${country}: total=${counts.total}, upsell=${counts.upsell}, noTrial=${counts.noTrial}, withTrial=${counts.withTrial}`);
  }

  if (upsellSubIds.length > 0) {
    console.log(`\nFirst 5 upsell sub IDs: ${upsellSubIds.slice(0, 5).join(', ')}`);
  }

  if (noTrialIds.length > 0) {
    console.log(`\nFirst 10 no-trial sub IDs: ${noTrialIds.slice(0, 10).join(', ')}`);

    // Check what invoices these subs DO have
    const sampleIds = noTrialIds.slice(0, 10);
    const ph2 = sampleIds.map(() => '?').join(',');
    const [invoiceRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT i.subscription_id, i.id, i.type, i.deleted, i.order_date
       FROM invoice i
       WHERE i.subscription_id IN (${ph2})
       ORDER BY i.subscription_id, i.id`,
      sampleIds,
    );

    console.log('\nInvoices for first 10 no-trial subs:');
    for (const inv of invoiceRows) {
      console.log(`  sub=${inv.subscription_id} inv=${inv.id} type=${inv.type} deleted=${inv.deleted} date=${inv.order_date}`);
    }
  }

  // Also check: how does the CRM define "trial"?
  // Our dashboard: has_trial = (first type-1 non-deleted invoice exists)
  // CRM might use subscription.has_trial or some other field
  const sampleSubIds = subIds.slice(0, 5);
  const ph3 = sampleSubIds.map(() => '?').join(',');
  const [subDetails] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT s.id, s.date_create, s.tag, s.status, s.product_id
     FROM subscription s WHERE s.id IN (${ph3})`,
    sampleSubIds,
  );
  console.log('\nSample subscription details:');
  for (const s of subDetails) {
    console.log(`  sub=${s.id} created=${s.date_create} tag=${s.tag} status=${s.status} product=${s.product_id}`);
  }

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
