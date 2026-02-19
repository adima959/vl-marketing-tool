/**
 * Debug: Compare CRM vs Dashboard for Feb 16, 2026
 *
 * CRM shows: Customers=24, Subscription=43, Trial=39
 * Dashboard shows: Subs=43 (22+19+2), Trials=32 (18+12+2)
 * Gap: 7 trials missing
 *
 * Run: npx tsx scripts/debug-feb16-gap.ts
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

const S = '2026-02-16 00:00:00';
const E = '2026-02-16 23:59:59';

async function main(): Promise<void> {
  // 1. All subscriptions created on Feb 16
  console.log('=== All subscriptions created Feb 16 ===\n');

  const allSubs = await mq<{
    id: number;
    customer_id: number;
    date_create: string;
    tag: string | null;
    source_id: number | null;
    tracking_id_4: string | null;
    tracking_id_2: string | null;
    has_trial_invoice: number;
    country: string | null;
    source: string | null;
  }>(`
    SELECT s.id, s.customer_id, s.date_create, s.tag, s.source_id,
           s.tracking_id_4, s.tracking_id_2,
           CASE WHEN i_trial.id IS NOT NULL THEN 1 ELSE 0 END AS has_trial_invoice,
           LOWER(c.country) AS country,
           COALESCE(sr_inv.source, sr_sub.source) AS source
    FROM subscription s
    LEFT JOIN customer c ON c.id = s.customer_id
    LEFT JOIN invoice i_trial ON i_trial.id = (
      SELECT MIN(i2.id) FROM invoice i2
      WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
    )
    LEFT JOIN invoice i_first ON i_first.subscription_id = s.id AND i_first.type = 1
      AND i_first.id = (SELECT MIN(i3.id) FROM invoice i3 WHERE i3.subscription_id = s.id AND i3.type = 1)
    LEFT JOIN source sr_inv ON sr_inv.id = i_first.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
    ORDER BY s.id
  `, [S, E]);

  // Classify each sub
  const rows: {
    id: number;
    country: string;
    source: string;
    isUpsell: boolean;
    hasTrial: boolean;
  }[] = [];

  for (const s of allSubs) {
    const tagStr = s.tag ? String(s.tag) : '';
    const isUpsell = tagStr.includes('parent-sub-id=');
    rows.push({
      id: s.id,
      country: s.country ?? '(null)',
      source: (s.source ?? '(null)').toLowerCase(),
      isUpsell,
      hasTrial: s.has_trial_invoice === 1,
    });
  }

  const total = rows.length;
  const regularSubs = rows.filter(r => !r.isUpsell);
  const upsellSubs = rows.filter(r => r.isUpsell);
  const regularTrials = regularSubs.filter(r => r.hasTrial);
  const upsellTrials = upsellSubs.filter(r => r.hasTrial);

  console.log(`  Total subs: ${total}`);
  console.log(`  Regular subs: ${regularSubs.length}`);
  console.log(`  Upsell subs: ${upsellSubs.length}`);
  console.log(`  Regular trials: ${regularTrials.length}`);
  console.log(`  Upsell trials (cross-sell): ${upsellTrials.length}`);
  console.log(`  Total trials: ${regularTrials.length + upsellTrials.length}`);

  // 2. Break down by country
  console.log('\n=== By country (regular subs only) ===\n');
  const byCountry = new Map<string, { subs: number; trials: number; cust: Set<number> }>();
  for (const r of regularSubs) {
    let entry = byCountry.get(r.country);
    if (!entry) {
      entry = { subs: 0, trials: 0, cust: new Set() };
      byCountry.set(r.country, entry);
    }
    entry.subs++;
    if (r.hasTrial) entry.trials++;
    const orig = allSubs.find(s => s.id === r.id);
    if (orig) entry.cust.add(orig.customer_id);
  }
  for (const [country, data] of [...byCountry.entries()].sort((a, b) => b[1].subs - a[1].subs)) {
    console.log(`  ${country}: cust=${data.cust.size} subs=${data.subs} trials=${data.trials}`);
  }

  // 3. Break down by country (upsell subs)
  console.log('\n=== By country (upsell subs) ===\n');
  const upsellByCountry = new Map<string, { subs: number; trials: number }>();
  for (const r of upsellSubs) {
    let entry = upsellByCountry.get(r.country);
    if (!entry) {
      entry = { subs: 0, trials: 0 };
      upsellByCountry.set(r.country, entry);
    }
    entry.subs++;
    if (r.hasTrial) entry.trials++;
  }
  for (const [country, data] of [...upsellByCountry.entries()].sort((a, b) => b[1].subs - a[1].subs)) {
    console.log(`  ${country}: upsell_subs=${data.subs} upsell_trials=${data.trials}`);
  }

  // 4. List subs that have trial=true in our query
  console.log('\n=== All subs with has_trial=true (regular + upsell) ===\n');
  const allTrials = rows.filter(r => r.hasTrial);
  for (const r of allTrials) {
    const orig = allSubs.find(s => s.id === r.id);
    console.log(
      `  sub ${r.id} | cust ${orig?.customer_id} | ${r.country} | ${r.source}` +
      ` | upsell=${r.isUpsell} | t4="${orig?.tracking_id_4}" t2="${orig?.tracking_id_2}"`
    );
  }

  // 5. List subs WITHOUT trial (to check if CRM counts them differently)
  console.log('\n=== Subs WITHOUT trial invoice ===\n');
  const noTrials = rows.filter(r => !r.hasTrial);
  for (const r of noTrials) {
    const orig = allSubs.find(s => s.id === r.id);
    console.log(
      `  sub ${r.id} | cust ${orig?.customer_id} | ${r.country} | ${r.source}` +
      ` | upsell=${r.isUpsell} | t4="${orig?.tracking_id_4}" t2="${orig?.tracking_id_2}"`
    );
  }

  // 6. Check: does the CRM external system use a different date field?
  // Check if there are subs NOT created on Feb 16 but with a trial invoice dated Feb 16
  console.log('\n=== Trial invoices dated Feb 16 for subs NOT created Feb 16 ===\n');
  const otherDateSubs = await mq<{
    sub_id: number;
    sub_date_create: string;
    invoice_date: string;
    customer_id: number;
    country: string | null;
  }>(`
    SELECT s.id AS sub_id, s.date_create AS sub_date_create,
           i.invoice_date, s.customer_id, LOWER(c.country) AS country
    FROM invoice i
    INNER JOIN subscription s ON s.id = i.subscription_id
    LEFT JOIN customer c ON c.id = s.customer_id
    WHERE i.type = 1
      AND i.deleted = 0
      AND DATE(i.invoice_date) = '2026-02-16'
      AND DATE(s.date_create) != '2026-02-16'
    ORDER BY s.id
  `);

  if (otherDateSubs.length === 0) {
    console.log('  None found.');
  } else {
    console.log(`  Found ${otherDateSubs.length} subs with trial invoice on Feb 16 but created on different date:`);
    for (const r of otherDateSubs) {
      console.log(
        `  sub ${r.sub_id} | cust ${r.customer_id} | ${r.country}` +
        ` | created=${String(r.sub_date_create).slice(0, 10)} | invoice_date=${String(r.invoice_date).slice(0, 10)}`
      );
    }
  }

  await maria.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
