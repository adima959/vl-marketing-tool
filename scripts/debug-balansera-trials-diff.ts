/**
 * Debug: Compare CRM's 422 Balansera/Denmark trials against our 412.
 * Find the 10 that CRM includes but we don't.
 *
 * Run: npx tsx scripts/debug-balansera-trials-diff.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

function parseCsv(filePath: string): number[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return raw
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => {
      const parts = line.split(',');
      return Number(parts[1].trim());
    })
    .filter((n) => n > 0);
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    connectTimeout: 30000,
  });

  const crmSubIds = parseCsv(path.join(__dirname, 'debug-balansera-trials-crm.csv'));
  console.log(`CRM trial sub IDs: ${crmSubIds.length}`);

  // Get our dashboard's view of these subs
  const ph = crmSubIds.map(() => '?').join(',');
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
       s.id AS sub_id,
       s.tag,
       (s.tag IS NOT NULL AND s.tag LIKE '%parent-sub-id=%') AS is_upsell_sub,
       c.country,
       COALESCE(pg.group_name, pg_sub.group_name) AS product_group,
       COALESCE(p.product_name, p_sub.product_name) AS product_name,
       COALESCE(p.sku, p_sub.sku) AS sku,
       i_active.id AS active_trial_inv,
       i_any.id AS any_trial_inv,
       i_any.deleted AS trial_inv_deleted
     FROM subscription s
     LEFT JOIN customer c ON c.id = s.customer_id
     LEFT JOIN product p_sub ON p_sub.id = s.product_id
     LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
     LEFT JOIN invoice i_active ON i_active.id = (
       SELECT MIN(i2.id) FROM invoice i2
       WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
     )
     LEFT JOIN invoice i_any ON i_any.id = (
       SELECT MIN(i2.id) FROM invoice i2
       WHERE i2.subscription_id = s.id AND i2.type = 1
     )
     LEFT JOIN (
       SELECT invoice_id, MIN(product_id) AS product_id
       FROM invoice_product GROUP BY invoice_id
     ) fp ON fp.invoice_id = COALESCE(i_active.id, i_any.id)
     LEFT JOIN product p ON p.id = fp.product_id
     LEFT JOIN product_group pg ON pg.id = p.product_group_id
     WHERE s.id IN (${ph})`,
    crmSubIds,
  );

  const rowMap = new Map<number, (typeof rows)[0]>();
  for (const r of rows) {
    rowMap.set(Number(r.sub_id), r);
  }

  // Our dashboard counts a "trial" as: non-upsell sub with active (non-deleted) type-1 invoice
  const dashboardTrials: number[] = [];
  const crmOnlyTrials: number[] = [];

  for (const subId of crmSubIds) {
    const r = rowMap.get(subId);
    if (!r) {
      crmOnlyTrials.push(subId);
      continue;
    }
    const isUpsell = Number(r.is_upsell_sub) === 1;
    const hasActiveTrial = r.active_trial_inv != null;

    if (!isUpsell && hasActiveTrial) {
      dashboardTrials.push(subId);
    } else {
      crmOnlyTrials.push(subId);
    }
  }

  console.log(`Dashboard would count as trial: ${dashboardTrials.length}`);
  console.log(`CRM-only (not in dashboard trials): ${crmOnlyTrials.length}`);

  console.log('\n=== CRM-ONLY TRIALS (the missing ones) ===');
  for (const subId of crmOnlyTrials) {
    const r = rowMap.get(subId);
    if (!r) {
      console.log(`  sub=${subId} — NOT FOUND IN DB`);
      continue;
    }
    const isUpsell = Number(r.is_upsell_sub) === 1;
    const hasActiveTrial = r.active_trial_inv != null;
    const hasDeletedTrial = r.any_trial_inv != null && Number(r.trial_inv_deleted) === 1;

    let reason = '';
    if (isUpsell) reason = 'UPSELL SUB';
    else if (hasDeletedTrial) reason = 'DELETED TRIAL INVOICE';
    else if (!r.any_trial_inv) reason = 'NO TRIAL INVOICE AT ALL';
    else reason = 'UNKNOWN';

    console.log(`  sub=${subId} reason=${reason} upsell=${isUpsell} activeTrial=${hasActiveTrial} deletedTrial=${hasDeletedTrial} product=${r.product_name}`);
  }

  await conn.end();
}

main().catch(console.error);
