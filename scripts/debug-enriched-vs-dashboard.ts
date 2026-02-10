/**
 * Debug: compare enriched table vs dashboard raw tables for country dimension
 * Usage: node --experimental-strip-types scripts/debug-enriched-vs-dashboard.ts
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

const START = '2026-02-04 00:00:00';
const END = '2026-02-06 23:59:59';

async function main(): Promise<void> {
  // 1. Dashboard exact query (matches dashboardQueryBuilder.ts line 156-179)
  const [dashRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT
       c.country,
       COUNT(DISTINCT s.id) AS subscription_count,
       COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count,
       COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS approved_count
     FROM subscription s
     LEFT JOIN customer c ON s.customer_id = c.id
     LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
     LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
     LEFT JOIN product p ON p.id = ip.product_id
     LEFT JOIN source sr ON sr.id = i.source_id
     LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
       AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
     WHERE s.date_create BETWEEN ? AND ?
       AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
     GROUP BY c.country
     ORDER BY subscription_count DESC`,
    [START, END]
  );

  console.log('=== DASHBOARD (raw tables, no deleted filter) ===');
  for (const r of dashRows) {
    console.log(`  ${String(r.country || '(null)').padEnd(15)} subs=${r.subscription_count} trials=${r.trial_count} approved=${r.approved_count}`);
  }

  // 2. Enriched table (what on-page uses)
  const [enrichedRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT
       country_normalized,
       COUNT(*) AS trials,
       SUM(is_approved) AS approved
     FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ?
     GROUP BY country_normalized
     ORDER BY trials DESC`,
    [START, END]
  );

  console.log('\n=== ENRICHED TABLE (what on-page uses) ===');
  for (const r of enrichedRows) {
    console.log(`  ${String(r.country_normalized || '(null)').padEnd(15)} trials=${r.trials} approved=${r.approved}`);
  }

  // 3. Find subscription IDs in dashboard but NOT in enriched (for DK specifically)
  const [dashDkSubs] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT DISTINCT s.id as subscription_id
     FROM subscription s
     LEFT JOIN customer c ON s.customer_id = c.id
     LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
     WHERE s.date_create BETWEEN ? AND ?
       AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
       AND c.country = 'Denmark'
       AND i.id IS NOT NULL`,
    [START, END]
  );

  const [enrichedDkSubs] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT subscription_id FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ? AND country_normalized = 'DK'`,
    [START, END]
  );

  const dashIds = new Set(dashDkSubs.map(r => r.subscription_id));
  const enrichedIds = new Set(enrichedDkSubs.map(r => r.subscription_id));

  const inDashOnly: number[] = [];
  for (const id of dashIds) {
    if (!enrichedIds.has(id)) inDashOnly.push(id);
  }

  const inEnrichedOnly: number[] = [];
  for (const id of enrichedIds) {
    if (!dashIds.has(id)) inEnrichedOnly.push(id);
  }

  console.log(`\n=== DK DIFF ===`);
  console.log(`Dashboard DK subs: ${dashIds.size}`);
  console.log(`Enriched DK subs: ${enrichedIds.size}`);
  console.log(`In dashboard only: ${inDashOnly.length}`);
  console.log(`In enriched only: ${inEnrichedOnly.length}`);

  // 4. Investigate why those subs are in dashboard but not enriched
  if (inDashOnly.length > 0) {
    const ids = inDashOnly.join(',');

    const [details] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT s.id, s.deleted as sub_deleted, s.date_create,
              i.id as inv_id, i.type, i.is_marked, i.deleted as inv_deleted,
              i.tag as inv_tag
       FROM subscription s
       LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
       WHERE s.id IN (${ids})
       ORDER BY s.id`
    );

    console.log('\nDashboard-only DK subs details:');
    for (const r of details) {
      const tag = r.inv_tag ? String(r.inv_tag).substring(0, 60) : '(null)';
      console.log(`  sub=${r.id} sub_del=${r.sub_deleted} inv=${r.inv_id} inv_del=${r.inv_deleted} marked=${r.is_marked} tag=${tag}`);
    }
  }

  // 5. Same analysis for SE
  const [dashSeSubs] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT DISTINCT s.id as subscription_id
     FROM subscription s
     LEFT JOIN customer c ON s.customer_id = c.id
     LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
     WHERE s.date_create BETWEEN ? AND ?
       AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
       AND c.country = 'Sweden'
       AND i.id IS NOT NULL`,
    [START, END]
  );

  const [enrichedSeSubs] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT subscription_id FROM crm_subscription_enriched
     WHERE date_create BETWEEN ? AND ? AND country_normalized = 'SE'`,
    [START, END]
  );

  const dashSeIds = new Set(dashSeSubs.map(r => r.subscription_id));
  const enrichedSeIds = new Set(enrichedSeSubs.map(r => r.subscription_id));

  const inDashOnlySe: number[] = [];
  for (const id of dashSeIds) {
    if (!enrichedSeIds.has(id)) inDashOnlySe.push(id);
  }

  console.log(`\n=== SE DIFF ===`);
  console.log(`Dashboard SE subs: ${dashSeIds.size}`);
  console.log(`Enriched SE subs: ${enrichedSeIds.size}`);
  console.log(`In dashboard only: ${inDashOnlySe.length}`);

  if (inDashOnlySe.length > 0) {
    const ids = inDashOnlySe.join(',');

    const [details] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT s.id, s.deleted as sub_deleted, s.date_create,
              i.id as inv_id, i.type, i.is_marked, i.deleted as inv_deleted,
              i.tag as inv_tag
       FROM subscription s
       LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
       WHERE s.id IN (${ids})
       ORDER BY s.id`
    );

    console.log('\nDashboard-only SE subs details:');
    for (const r of details) {
      const tag = r.inv_tag ? String(r.inv_tag).substring(0, 60) : '(null)';
      console.log(`  sub=${r.id} sub_del=${r.sub_deleted} inv=${r.inv_id} inv_del=${r.inv_deleted} marked=${r.is_marked} tag=${tag}`);
    }
  }

  // 6. Check: does the dashboard count invoice IDs (can one sub have multiple type=1 invoices)?
  const [multiInvoice] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT s.id, COUNT(i.id) as invoice_count
     FROM subscription s
     INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
     WHERE s.date_create BETWEEN ? AND ?
       AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
     GROUP BY s.id
     HAVING COUNT(i.id) > 1
     LIMIT 20`,
    [START, END]
  );

  console.log(`\n=== SUBS WITH MULTIPLE TYPE=1 INVOICES ===`);
  console.log(`Count: ${multiInvoice.length}`);
  for (const r of multiInvoice) {
    console.log(`  sub=${r.id} invoices=${r.invoice_count}`);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
