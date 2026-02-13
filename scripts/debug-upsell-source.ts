import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env.local' });
const pool = mysql.createPool({ host: process.env.MARIADB_HOST, port: parseInt(process.env.MARIADB_PORT || '3306'), user: process.env.MARIADB_USER, password: process.env.MARIADB_PASSWORD, database: process.env.MARIADB_DATABASE, connectTimeout: 15000 });

async function main(): Promise<void> {
  const [rows] = await pool.execute(`
    SELECT
      CASE WHEN uo.type = 1 THEN 'trial' WHEN uo.type = 3 THEN 'OTS' ELSE 'other' END AS type_label,
      COUNT(DISTINCT uo.id) AS cnt,
      sr_uo.source AS upsell_invoice_source
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    LEFT JOIN invoice uo ON uo.customer_id = s.customer_id AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
    LEFT JOIN source sr_uo ON sr_uo.id = uo.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(c.country) = 'denmark'
      AND LOWER(COALESCE(sr.source, sr_sub.source)) = 'adwords'
      AND uo.id IS NOT NULL
    GROUP BY uo.type, sr_uo.source
    ORDER BY cnt DESC
  `, ['2026-01-11 00:00:00', '2026-02-11 23:59:59']);

  console.log('Upsell invoices for Adwords Denmark (Jan 11 - Feb 11):');
  for (const r of rows as any[]) {
    console.log(`  ${r.type_label}: ${r.cnt} (upsell invoice source: ${r.upsell_invoice_source})`);
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
