/**
 * Debug: Investigate 5 missing trials in Sweden + Adwords + Feb 9-16, 2026
 *
 * CRM shows 22 trials, dashboard shows 15 + 2 cross-sell = 17.
 * Where are the other 5?
 *
 * Run: npx tsx scripts/debug-trial-gap.ts
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

const maria = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectTimeout: 30000,
});

async function mq<T>(sql: string, p: unknown[] = []): Promise<T[]> {
  const [rows] = await maria.execute(sql, p);
  return rows as T[];
}

// The 22 subscription IDs from the CRM (deduplicated)
const subIds = [
  318011, 318060, 318061, 318063, 318112, 318113, 318132, 318138,
  318197, 318215, 318221, 318231, 318320, 318332, 318334, 318337,
  316895, 318361,
];

async function main(): Promise<void> {
  // 1. Get full details for all listed subscription IDs
  const placeholders = subIds.map(() => '?').join(',');
  const subs = await mq<{
    id: number;
    customer_id: number;
    date_create: string;
    tag: string | null;
    source_id: number | null;
    tracking_id: string | null;
    tracking_id_2: string | null;
    tracking_id_4: string | null;
  }>(`
    SELECT s.id, s.customer_id, s.date_create, s.tag, s.source_id,
           s.tracking_id, s.tracking_id_2, s.tracking_id_4
    FROM subscription s
    WHERE s.id IN (${placeholders})
    ORDER BY s.id
  `, subIds);

  console.log(`=== ${subs.length} unique subscriptions found ===\n`);

  // 2. Check basic fields + upsell status
  for (const s of subs) {
    const tagStr = s.tag ? String(s.tag) : '';
    const isUpsell = tagStr.includes('parent-sub-id=');
    console.log(
      `  sub ${s.id} | cust ${s.customer_id} | ${String(s.date_create).slice(0, 10)}` +
      ` | upsell=${isUpsell}` +
      ` | t4="${s.tracking_id_4}" t2="${s.tracking_id_2}" t1="${s.tracking_id}"` +
      ` | src_id=${s.source_id}`
    );
  }

  // 4. Check source for each sub
  console.log('\n=== Sources for these subs ===\n');
  const sources = await mq<{
    sub_id: number;
    inv_source: string | null;
    sub_source: string | null;
  }>(`
    SELECT s.id AS sub_id,
           sr_inv.source AS inv_source,
           sr_sub.source AS sub_source
    FROM subscription s
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      AND i.id = (SELECT MIN(i2.id) FROM invoice i2 WHERE i2.subscription_id = s.id AND i2.type = 1)
    LEFT JOIN source sr_inv ON sr_inv.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.id IN (${placeholders})
    ORDER BY s.id
  `, subIds);

  for (const r of sources) {
    console.log(`  sub ${r.sub_id}: inv_source="${r.inv_source}" sub_source="${r.sub_source}"`);
  }

  // 5. Check country
  console.log('\n=== Country for these subs ===\n');
  const countries = await mq<{
    sub_id: number;
    country: string | null;
  }>(`
    SELECT s.id AS sub_id, c.country
    FROM subscription s
    LEFT JOIN customer c ON c.id = s.customer_id
    WHERE s.id IN (${placeholders})
    ORDER BY s.id
  `, subIds);

  for (const r of countries) {
    console.log(`  sub ${r.sub_id}: country="${r.country}"`);
  }

  // 6. Check what the dashboard query would see: has_trial logic
  // has_trial = (i.id IS NOT NULL) where i = first invoice with type=1 and deleted=0
  console.log('\n=== Dashboard has_trial check (trial invoice existence) ===\n');
  const trialCheck = await mq<{
    sub_id: number;
    has_trial_invoice: number;
    first_invoice_id: number | null;
  }>(`
    SELECT s.id AS sub_id,
           CASE WHEN i.id IS NOT NULL THEN 1 ELSE 0 END AS has_trial_invoice,
           i.id AS first_invoice_id
    FROM subscription s
    LEFT JOIN invoice i ON i.id = (
      SELECT MIN(i2.id) FROM invoice i2
      WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
    )
    WHERE s.id IN (${placeholders})
    ORDER BY s.id
  `, subIds);

  let hasTrial = 0;
  let noTrial = 0;
  for (const r of trialCheck) {
    const trial = r.has_trial_invoice === 1;
    if (trial) hasTrial++;
    else noTrial++;
    console.log(
      `  sub ${r.sub_id}: has_trial_invoice=${trial} (invoice_id=${r.first_invoice_id})`
    );
  }
  console.log(`\n  Summary: ${hasTrial} with trial invoice, ${noTrial} without`);

  await maria.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
