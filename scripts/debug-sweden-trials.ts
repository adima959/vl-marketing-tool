/**
 * Debug: Sweden trials breakdown — upsell subs with vs without trials
 * Run: npx tsx scripts/debug-sweden-trials.ts
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

  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
       s.id AS sub_id,
       (s.tag IS NOT NULL AND s.tag LIKE '%parent-sub-id=%') AS is_upsell_sub,
       (i.id IS NOT NULL) AS has_trial
     FROM subscription s
     LEFT JOIN customer c ON c.id = s.customer_id
     LEFT JOIN invoice i ON i.id = (
       SELECT MIN(i2.id) FROM invoice i2
       WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
     )
     WHERE s.date_create BETWEEN ? AND ?
       AND LOWER(c.country) IN ('sweden', 'sverige')`,
    [startDate, endDate],
  );

  const nonUpsell = rows.filter((r) => Number(r.is_upsell_sub) === 0);
  const upsell = rows.filter((r) => Number(r.is_upsell_sub) === 1);

  const nonUpsellTrials = nonUpsell.filter((r) => Number(r.has_trial) === 1);
  const upsellTrials = upsell.filter((r) => Number(r.has_trial) === 1);
  const upsellNoTrial = upsell.filter((r) => Number(r.has_trial) === 0);

  console.log('Sweden totals:');
  console.log(`  Non-upsell subs: ${nonUpsell.length} (trials: ${nonUpsellTrials.length})`);
  console.log(`  Upsell subs: ${upsell.length} (with trial: ${upsellTrials.length}, without: ${upsellNoTrial.length})`);
  console.log();
  console.log(`Dashboard Trials: ${nonUpsellTrials.length}`);
  console.log(`Correct CRM total: ${nonUpsellTrials.length} + ${upsellTrials.length} = ${nonUpsellTrials.length + upsellTrials.length}`);
  console.log(`CRM expected: 282`);

  await conn.end();
}

main().catch(console.error);
