/**
 * Debug: Find all 123 subs in CRM but excluded by s.tag filter
 * Show full details for each
 *
 * Run: npx tsx scripts/debug-missing-full.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const pool = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectTimeout: 15000,
});

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = params.length > 0
    ? await pool.execute(sql, params)
    : await pool.query(sql);
  return rows as T[];
}

const START = '2026-01-12 00:00:00';
const END = '2026-02-09 23:59:59';

async function main() {
  // Parse CRM IDs
  const raw = readFileSync('subscription-list.tsx', 'utf-8');
  const crmIds = raw.split('\n').map(l => l.trim()).filter(l => /^\d+$/.test(l)).map(Number);
  console.log(`CRM export: ${crmIds.length} IDs\n`);

  // Get s.tag filtered set (842)
  const sTagRows = await query<{ id: number }>(`
    SELECT DISTINCT s.id
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  const sTagSet = new Set(sTagRows.map(r => r.id));
  console.log(`DB s.tag filter: ${sTagSet.size}\n`);

  // Find missing: in CRM but excluded by s.tag
  const crmSet = new Set(crmIds);
  const missing = crmIds.filter(id => !sTagSet.has(id));
  console.log(`Missing from dashboard (excluded by s.tag): ${missing.length}\n`);

  // Also check: in DB s.tag set but NOT in CRM
  const dbTotal = await query<{ id: number }>(`
    SELECT DISTINCT s.id FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ? AND c.country = 'Denmark'
  `, [START, END]);
  const dbTotalSet = new Set(dbTotal.map(r => r.id));
  const inDbNotCrm = [...dbTotalSet].filter(id => !crmSet.has(id));
  console.log(`In DB but NOT in CRM: ${inDbNotCrm.length}\n`);

  if (missing.length === 0) {
    console.log('No missing subscriptions!');
    await pool.end();
    return;
  }

  // Get full details for ALL missing subs
  const details = await query<Record<string, unknown>>(`
    SELECT
      s.id,
      s.date_create as dateCreate,
      s.status,
      s.deleted,
      s.product_id as productId,
      s.tag as sTag,
      c.country,
      c.email,
      COALESCE(p_sub.product_name, '(none)') as productName,
      GROUP_CONCAT(
        DISTINCT CONCAT(i.id, '|', i.type, '|', i.deleted, '|', IFNULL(i.tag, 'NULL'))
        SEPARATOR ';;;'
      ) as invoiceDetails
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.id IN (${missing.join(',')})
    GROUP BY s.id
    ORDER BY s.id
  `, []);

  // Categorize and display
  const categories: Record<string, typeof details> = {};

  for (const row of details) {
    const sTag = String(row.sTag || '');
    const hasParentSubId = sTag.includes('parent-sub-id=');
    const hasFormTypeUpsell = sTag.includes('form-type-upsell');

    let category: string;
    if (hasParentSubId && hasFormTypeUpsell) {
      category = 'A: s.tag has BOTH parent-sub-id AND form-type-upsell';
    } else if (hasParentSubId) {
      category = 'B: s.tag has parent-sub-id ONLY (no form-type-upsell)';
    } else if (hasFormTypeUpsell) {
      category = 'C: s.tag has form-type-upsell ONLY (no parent-sub-id)';
    } else {
      category = 'D: s.tag has NEITHER (unexpected!)';
    }

    if (!categories[category]) categories[category] = [];
    categories[category].push(row);
  }

  for (const [cat, rows] of Object.entries(categories).sort()) {
    console.log(`\n=== ${cat} (${rows.length} subs) ===`);
    for (const row of rows) {
      const sTag = String(row.sTag || '');
      // Extract parent-sub-id value
      const parentMatch = sTag.match(/parent-sub-id=(\d+)/);
      const parentSubId = parentMatch ? parentMatch[1] : 'N/A';

      // Parse invoice details
      const invStr = String(row.invoiceDetails || '');
      const invHasParent = invStr.includes('parent-sub-id=');

      const dateStr = String(row.dateCreate).substring(0, 24);
      console.log(
        `  s.id=${row.id} | date=${dateStr} | status=${row.status} | del=${row.deleted}` +
        ` | product="${row.productName}"` +
        ` | parent-sub-id=${parentSubId}` +
        ` | i.tag has parent=${invHasParent}`
      );
    }
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  for (const [cat, rows] of Object.entries(categories).sort()) {
    console.log(`${cat}: ${rows.length}`);
  }
  console.log(`\nTotal missing: ${missing.length}`);

  // Check if any missing sub IDs are NOT in DB at all
  const notInDb = missing.filter(id => !dbTotalSet.has(id));
  if (notInDb.length > 0) {
    console.log(`\nWARNING: ${notInDb.length} CRM IDs not found in DB at all: ${notInDb.join(', ')}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});
