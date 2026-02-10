/**
 * Debug: check what CRM returns for campaign NULL/empty in DK
 * Usage: node --experimental-strip-types scripts/debug-campaign-null.ts
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env.local' });

const pool = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectionLimit: 3,
});

async function main(): Promise<void> {
  // What does the CRM campaign query return for DK?
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT tracking_id_4 AS dimension_value,
            tracking_id_4 IS NULL AS is_null,
            LENGTH(tracking_id_4) AS len,
            COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN '2026-02-04 00:00:00' AND '2026-02-06 23:59:59'
       AND country_normalized = 'DK'
     GROUP BY tracking_id_4
     ORDER BY trials DESC`
  );

  console.log('CRM campaign values for DK (Feb 4-6):');
  for (const r of rows) {
    const val = r.dimension_value === null ? '(NULL)' : r.dimension_value === '' ? '(empty)' : r.dimension_value;
    console.log(`  val=${String(val).substring(0, 40).padEnd(40)} is_null=${r.is_null} len=${r.len} trials=${r.trials} approved=${r.approved}`);
  }
  console.log(`\nTotal rows: ${rows.length}`);
  console.log(`Total trials: ${rows.reduce((sum: number, r: any) => sum + Number(r.trials), 0)}`);

  // What CRM subs have tracking_id_4 = NULL or '' for DK?
  const [emptySubs] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT subscription_id, source_normalized, tracking_id_4, ff_vid
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN '2026-02-04 00:00:00' AND '2026-02-06 23:59:59'
       AND country_normalized = 'DK'
       AND (tracking_id_4 IS NULL OR tracking_id_4 = '')
     LIMIT 20`
  );
  console.log(`\nDK subs with empty/NULL campaign: ${emptySubs.length}`);
  for (const r of emptySubs) {
    console.log(`  sub=${r.subscription_id} src=${r.source_normalized || '(empty)'} campaign='${r.tracking_id_4}' ff_vid=${r.ff_vid || '(null)'}`);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
