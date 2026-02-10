/**
 * Check why enriched table has more trials than dashboard raw tables
 * Usage: node --experimental-strip-types scripts/check-enriched-diff.ts
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

const D = '2026-02-05';

async function main(): Promise<void> {
  // Get subscription IDs from enriched table
  const [enrichedSubs] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT subscription_id FROM crm_subscription_enriched WHERE date_create BETWEEN ? AND ?',
    [`${D} 00:00:00`, `${D} 23:59:59`]
  );

  // Get subscription IDs from dashboard logic
  const [dashSubs] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT DISTINCT s.id as subscription_id
     FROM subscription s
     INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
     WHERE s.date_create BETWEEN ? AND ?
       AND s.deleted = 0
       AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')`,
    [`${D} 00:00:00`, `${D} 23:59:59`]
  );

  const enrichedIds = new Set(enrichedSubs.map(r => r.subscription_id));
  const dashIds = new Set(dashSubs.map(r => r.subscription_id));

  // IDs in enriched but NOT in dashboard
  const inEnrichedOnly: number[] = [];
  for (const id of enrichedIds) {
    if (!dashIds.has(id)) inEnrichedOnly.push(id);
  }

  // IDs in dashboard but NOT in enriched
  const inDashOnly: number[] = [];
  for (const id of dashIds) {
    if (!enrichedIds.has(id)) inDashOnly.push(id);
  }

  console.log(`Enriched: ${enrichedIds.size} | Dashboard: ${dashIds.size}`);
  console.log(`In enriched only: ${inEnrichedOnly.length} → ${JSON.stringify(inEnrichedOnly)}`);
  console.log(`In dashboard only: ${inDashOnly.length} → ${JSON.stringify(inDashOnly)}`);

  // Check those extra enriched subs
  if (inEnrichedOnly.length > 0) {
    const ids = inEnrichedOnly.join(',');

    // Check if they're deleted
    const [deletedCheck] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT id, deleted, date_create FROM subscription WHERE id IN (${ids})`
    );
    console.log('\nSubscription status of extra enriched subs:');
    for (const r of deletedCheck) {
      console.log(`  sub=${r.id} deleted=${r.deleted} date=${r.date_create}`);
    }

    // Check their invoices
    const [invoiceCheck] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT i.subscription_id, i.id as invoice_id, i.type, i.is_marked,
              i.deleted as inv_deleted, i.tag
       FROM invoice i WHERE i.subscription_id IN (${ids}) AND i.type = 1`
    );
    console.log('\nInvoice details of extra enriched subs:');
    for (const r of invoiceCheck) {
      const tag = r.tag ? String(r.tag).substring(0, 80) : '(null)';
      console.log(`  sub=${r.subscription_id} inv=${r.invoice_id} type=${r.type} marked=${r.is_marked} inv_deleted=${r.inv_deleted} tag=${tag}`);
    }

    // Check if they have NO invoices at all (enriched table might have been populated from sub without invoice)
    const [noInvoice] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT s.id FROM subscription s
       LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
       WHERE s.id IN (${ids})
         AND i.id IS NULL`
    );
    if (noInvoice.length > 0) {
      console.log(`\nSubs in enriched with NO type=1 invoice: ${noInvoice.map(r => r.id).join(', ')}`);
    }

    // Check if their invoices are deleted or tagged as upsell
    const [problematic] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT i.subscription_id,
              i.deleted as inv_deleted,
              (i.tag LIKE '%parent-sub-id=%') as is_upsell_tag,
              i.tag
       FROM invoice i
       WHERE i.subscription_id IN (${ids}) AND i.type = 1`
    );
    console.log('\nProblem diagnosis:');
    for (const r of problematic) {
      const issues: string[] = [];
      if (r.inv_deleted === 1) issues.push('INVOICE DELETED');
      if (r.is_upsell_tag) issues.push('UPSELL TAG');
      if (issues.length === 0) issues.push('NO OBVIOUS ISSUE - should be in dashboard');
      const tag = r.tag ? String(r.tag).substring(0, 60) : '(null)';
      console.log(`  sub=${r.subscription_id} → ${issues.join(', ')} | tag=${tag}`);
    }
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
