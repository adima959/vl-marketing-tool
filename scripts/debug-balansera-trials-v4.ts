/**
 * Debug v4: Run the actual Q1 subscription query and compare against CRM's 419.
 *
 * Run: npx tsx scripts/debug-balansera-trials-v4.ts
 */
import * as fs from 'fs';
import * as path from 'path';
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

  // Parse CRM trial list (exclude known upsells)
  const upsellSubIds = new Set([316431, 316733, 317146]);
  const raw = fs.readFileSync(path.join(__dirname, 'debug-balansera-trials-crm.csv'), 'utf-8');
  const crmTrialSubIds = new Set(
    raw.trim().split('\n').slice(1)
      .map((l) => Number(l.split(',')[1].trim()))
      .filter((n) => n > 0 && !upsellSubIds.has(n))
  );
  console.log(`CRM non-upsell trial subs: ${crmTrialSubIds.size}`);

  const startDate = '2026-01-09 00:00:00';
  const endDate = '2026-02-09 23:59:59';

  // Run the EXACT Q1 query from salesQueryBuilder.ts
  const [q1Rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
      s.id,
      'subscription'                                    AS type,
      NULL                                              AS parent_subscription_id,
      s.date_create                                     AS date,
      c.id                                              AS customer_id,
      CONCAT(c.first_name, ' ', c.last_name)            AS customer_name,
      (DATE(c.date_registered) = DATE(s.date_create))   AS is_new_customer,
      c.country,
      COALESCE(pg.group_name, pg_sub.group_name)        AS product_group,
      COALESCE(p.product_name, p_sub.product_name)      AS product,
      COALESCE(p.sku, p_sub.sku)                        AS sku,
      COALESCE(sr.source, sr_sub.source)                AS source,
      i.total,
      (i.id IS NOT NULL)                                AS has_trial,
      COALESCE(i.is_marked = 1, 0)                      AS is_approved,
      (i.on_hold_date IS NOT NULL)                       AS is_on_hold,
      0                                                  AS is_deleted,
      (s.tag IS NOT NULL AND s.tag LIKE '%parent-sub-id=%') AS is_upsell_sub
    FROM subscription s
    LEFT JOIN customer c           ON c.id = s.customer_id
    LEFT JOIN invoice i            ON i.id = (
      SELECT MIN(i2.id) FROM invoice i2
      WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
    )
    LEFT JOIN (
      SELECT invoice_id, MIN(product_id) AS product_id
      FROM invoice_product GROUP BY invoice_id
    ) fp                           ON fp.invoice_id = i.id
    LEFT JOIN product p            ON p.id = fp.product_id
    LEFT JOIN product_group pg     ON pg.id = p.product_group_id
    LEFT JOIN product p_sub        ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr            ON sr.id = i.source_id
    LEFT JOIN source sr_sub        ON sr_sub.id = s.source_id
    LEFT JOIN subscription_cancel_reason scr ON scr.id = (
      SELECT MAX(scr2.id) FROM subscription_cancel_reason scr2
      WHERE scr2.subscription_id = s.id
    )
    LEFT JOIN cancel_reason cr     ON cr.id = scr.cancel_reason_id
    WHERE s.date_create BETWEEN ? AND ?`,
    [startDate, endDate],
  );

  // Filter to Denmark + Balansera + non-upsell + has_trial (matching dashboard aggregation)
  const dashTrials = q1Rows.filter((r) => {
    const country = String(r.country || '').toLowerCase();
    const group = String(r.product_group || '').toLowerCase();
    return (country === 'denmark') &&
           group.includes('balans') &&
           Number(r.is_upsell_sub) === 0 &&
           Number(r.has_trial) === 1;
  });

  const dashTrialSubIds = new Set(dashTrials.map((r) => Number(r.id)));
  console.log(`Dashboard Balansera/DK non-upsell trials: ${dashTrialSubIds.size}`);

  // Find CRM trials not in dashboard
  const inCrmNotDash: number[] = [];
  for (const subId of crmTrialSubIds) {
    if (!dashTrialSubIds.has(subId)) inCrmNotDash.push(subId);
  }

  // Find dashboard trials not in CRM
  const inDashNotCrm: number[] = [];
  for (const subId of dashTrialSubIds) {
    if (!crmTrialSubIds.has(subId)) inDashNotCrm.push(subId);
  }

  console.log(`\nIn CRM but not dashboard: ${inCrmNotDash.length}`);
  console.log(`In dashboard but not CRM: ${inDashNotCrm.length}`);

  // Investigate the ones in CRM but not dashboard
  if (inCrmNotDash.length > 0) {
    console.log('\n=== IN CRM BUT NOT DASHBOARD ===');
    for (const subId of inCrmNotDash) {
      // Find this sub in q1Rows
      const r = q1Rows.find((row) => Number(row.id) === subId);
      if (!r) {
        console.log(`  sub=${subId} — NOT IN Q1 RESULTS (outside date range?)`);
        // Check manually
        const [check] = await conn.query<mysql.RowDataPacket[]>(
          'SELECT s.id, s.date_create, c.country FROM subscription s LEFT JOIN customer c ON c.id = s.customer_id WHERE s.id = ?',
          [subId],
        );
        if (check.length > 0) {
          console.log(`    date=${check[0].date_create} country=${check[0].country}`);
        }
      } else {
        const country = String(r.country || '');
        const group = String(r.product_group || '');
        const hasTrial = Number(r.has_trial);
        const isUpsell = Number(r.is_upsell_sub);
        console.log(`  sub=${subId} country=${country} group=${group} hasTrial=${hasTrial} upsell=${isUpsell}`);
      }
    }
  }

  if (inDashNotCrm.length > 0) {
    console.log('\n=== IN DASHBOARD BUT NOT CRM (first 10) ===');
    for (const subId of inDashNotCrm.slice(0, 10)) {
      const r = q1Rows.find((row) => Number(row.id) === subId);
      if (r) {
        console.log(`  sub=${subId} group=${r.product_group} product=${r.product}`);
      }
    }
  }

  await conn.end();
}

main().catch(console.error);
