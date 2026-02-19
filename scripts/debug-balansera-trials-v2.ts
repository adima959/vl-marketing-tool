/**
 * Debug v2: Check deleted trial invoices for Balansera no-trial subs
 * Run: npx tsx scripts/debug-balansera-trials-v2.ts
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    connectTimeout: 30000,
  });

  const startDate = '2026-01-09 00:00:00';
  const endDate = '2026-02-09 23:59:59';

  // Get all Balansera/Denmark non-upsell subs that have NO non-deleted trial invoice
  // but DO have a deleted trial invoice
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
       s.id AS sub_id,
       (SELECT COUNT(*) FROM invoice i WHERE i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0) AS active_trial_count,
       (SELECT COUNT(*) FROM invoice i WHERE i.subscription_id = s.id AND i.type = 1 AND i.deleted = 1) AS deleted_trial_count,
       (SELECT COUNT(*) FROM invoice i WHERE i.subscription_id = s.id AND i.type = 1) AS total_trial_count
     FROM subscription s
     LEFT JOIN customer c ON c.id = s.customer_id
     LEFT JOIN product p_sub ON p_sub.id = s.product_id
     LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
     WHERE s.date_create BETWEEN ? AND ?
       AND LOWER(c.country) = 'denmark'
       AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
       AND (p_sub.sku LIKE '%alans%' OR pg_sub.group_name LIKE '%alans%')`,
    [startDate, endDate],
  );

  let activeTrials = 0;
  let deletedOnlyTrials = 0;
  let noTrials = 0;

  for (const r of rows) {
    const active = Number(r.active_trial_count);
    const deleted = Number(r.deleted_trial_count);
    if (active > 0) {
      activeTrials++;
    } else if (deleted > 0) {
      deletedOnlyTrials++;
    } else {
      noTrials++;
    }
  }

  console.log(`Total non-upsell Balansera/DK subs: ${rows.length}`);
  console.log(`  Active trial invoice: ${activeTrials} (= dashboard Trials)`);
  console.log(`  Deleted-only trial invoice: ${deletedOnlyTrials}`);
  console.log(`  No trial invoice at all: ${noTrials}`);
  console.log();
  console.log('Dashboard Trials:', activeTrials);
  console.log('CRM likely counts (active + deleted-only):', activeTrials + deletedOnlyTrials);
  console.log('Add upsell trials: +3 =', activeTrials + deletedOnlyTrials + 3);
  console.log('CRM expected: 422');

  await conn.end();
}

main().catch(console.error);
