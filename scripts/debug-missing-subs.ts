/**
 * Debug: Compare CRM export subscription list against dashboard query results
 * Find missing subscriptions and investigate why they're excluded
 *
 * Run: npx tsx scripts/debug-missing-subs.ts
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
  // Parse CRM export subscription IDs
  const raw = readFileSync('subscription-list.tsx', 'utf-8');
  const crmIds = raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^\d+$/.test(line))
    .map(Number);
  console.log(`CRM export: ${crmIds.length} subscription IDs\n`);

  // Get dashboard set with i.tag filter (original = 875)
  const iTagRows = await query<{ id: number }>(`
    SELECT DISTINCT s.id
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  const iTagSet = new Set(iTagRows.map(r => r.id));
  console.log(`Dashboard with i.tag filter: ${iTagSet.size}`);

  // Get dashboard set with s.tag filter (current = 842)
  const sTagRows = await query<{ id: number }>(`
    SELECT DISTINCT s.id
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
  `, [START, END]);
  const sTagSet = new Set(sTagRows.map(r => r.id));
  console.log(`Dashboard with s.tag filter: ${sTagSet.size}`);

  // Get total set (no tag filter)
  const totalRows = await query<{ id: number }>(`
    SELECT DISTINCT s.id
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    WHERE s.date_create BETWEEN ? AND ?
      AND c.country = 'Denmark'
  `, [START, END]);
  const totalSet = new Set(totalRows.map(r => r.id));
  console.log(`Dashboard no tag filter: ${totalSet.size}`);

  const crmSet = new Set(crmIds);

  // === SET DIFFERENCES ===
  console.log('\n=== SET DIFFERENCES ===');

  // CRM IDs not in total DB set (not even without filters)
  const inCrmNotInDb = crmIds.filter(id => !totalSet.has(id));
  console.log(`\nIn CRM but NOT in DB (date+country): ${inCrmNotInDb.length}`);
  if (inCrmNotInDb.length > 0) {
    console.log(`  IDs: ${inCrmNotInDb.slice(0, 20).join(', ')}${inCrmNotInDb.length > 20 ? '...' : ''}`);
  }

  // In DB total but not in CRM (DB has them, CRM export doesn't)
  const inDbNotInCrm = [...totalSet].filter(id => !crmSet.has(id));
  console.log(`\nIn DB but NOT in CRM export: ${inDbNotInCrm.length}`);
  if (inDbNotInCrm.length > 0) {
    console.log(`  IDs: ${inDbNotInCrm.slice(0, 20).join(', ')}${inDbNotInCrm.length > 20 ? '...' : ''}`);
  }

  // In CRM but excluded by i.tag filter
  const inCrmExcludedByITag = crmIds.filter(id => totalSet.has(id) && !iTagSet.has(id));
  console.log(`\nIn CRM but excluded by i.tag: ${inCrmExcludedByITag.length}`);

  // In CRM but excluded by s.tag filter
  const inCrmExcludedBySTag = crmIds.filter(id => totalSet.has(id) && !sTagSet.has(id));
  console.log(`In CRM but excluded by s.tag: ${inCrmExcludedBySTag.length}`);

  // === INVESTIGATE MISSING SUBS ===

  // Group 1: In CRM, in DB total, but NOT in i.tag set (excluded by i.tag)
  if (inCrmExcludedByITag.length > 0) {
    console.log(`\n=== DETAIL: CRM subs excluded by i.tag filter (${inCrmExcludedByITag.length}) ===`);
    const details = await query<Record<string, unknown>>(`
      SELECT
        s.id,
        s.date_create,
        s.tag as s_tag,
        s.deleted as s_deleted,
        s.status as s_status,
        s.product_id,
        c.country,
        GROUP_CONCAT(DISTINCT CONCAT('inv_', i.id, ':type=', i.type, ',del=', i.deleted, ',tag=', IFNULL(i.tag,'NULL')) SEPARATOR ' | ') as invoices
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      WHERE s.id IN (${inCrmExcludedByITag.join(',')})
      GROUP BY s.id
      ORDER BY s.id
      LIMIT 15
    `, []);
    for (const row of details) {
      const sTag = String(row.s_tag || '').substring(0, 80);
      const invs = String(row.invoices || 'NONE').substring(0, 120);
      console.log(`  s.id=${row.id} del=${row.s_deleted} status=${row.s_status} s.tag="${sTag}" invoices="${invs}"`);
    }
  }

  // Group 2: In CRM, in DB total, but NOT in s.tag set (excluded by s.tag)
  if (inCrmExcludedBySTag.length > 0) {
    console.log(`\n=== DETAIL: CRM subs excluded by s.tag filter (${inCrmExcludedBySTag.length}) ===`);
    const details = await query<Record<string, unknown>>(`
      SELECT
        s.id,
        s.date_create,
        s.tag as s_tag,
        s.deleted as s_deleted,
        s.status as s_status,
        s.product_id,
        c.country,
        GROUP_CONCAT(DISTINCT CONCAT('inv_', i.id, ':type=', i.type, ',del=', i.deleted, ',tag=', IFNULL(i.tag,'NULL')) SEPARATOR ' | ') as invoices
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      WHERE s.id IN (${inCrmExcludedBySTag.join(',')})
      GROUP BY s.id
      ORDER BY s.id
      LIMIT 15
    `, []);
    for (const row of details) {
      const sTag = String(row.s_tag || '').substring(0, 80);
      const invs = String(row.invoices || 'NONE').substring(0, 120);
      console.log(`  s.id=${row.id} del=${row.s_deleted} status=${row.s_status} s.tag="${sTag}" invoices="${invs}"`);
    }
  }

  // Group 3: In CRM but NOT in DB at all (date/country mismatch)
  if (inCrmNotInDb.length > 0) {
    console.log(`\n=== DETAIL: CRM subs NOT in DB set at all (${inCrmNotInDb.length}) ===`);
    const details = await query<Record<string, unknown>>(`
      SELECT
        s.id,
        s.date_create,
        s.tag as s_tag,
        s.deleted as s_deleted,
        s.status as s_status,
        c.country
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      WHERE s.id IN (${inCrmNotInDb.join(',')})
      ORDER BY s.id
    `, []);
    for (const row of details) {
      console.log(`  s.id=${row.id} date=${String(row.date_create).substring(0,19)} country="${row.country}" del=${row.s_deleted} status=${row.s_status} s.tag="${String(row.s_tag || '').substring(0, 60)}"`);
    }
  }

  // Group 4: In DB but NOT in CRM (extra subs the DB has)
  if (inDbNotInCrm.length > 0) {
    console.log(`\n=== DETAIL: DB subs NOT in CRM export (${inDbNotInCrm.length}) ===`);
    const sampleIds = inDbNotInCrm.slice(0, 15);
    const details = await query<Record<string, unknown>>(`
      SELECT
        s.id,
        s.date_create,
        s.tag as s_tag,
        s.deleted as s_deleted,
        s.status as s_status,
        c.country
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      WHERE s.id IN (${sampleIds.join(',')})
      ORDER BY s.id
    `, []);
    for (const row of details) {
      console.log(`  s.id=${row.id} date=${String(row.date_create).substring(0,19)} country="${row.country}" del=${row.s_deleted} status=${row.s_status} s.tag="${String(row.s_tag || '').substring(0, 60)}"`);
    }
  }

  // === SUMMARY RECONCILIATION ===
  console.log('\n=== RECONCILIATION ===');
  console.log(`CRM export:           ${crmSet.size} subs`);
  console.log(`DB total (no filter): ${totalSet.size} subs`);
  console.log(`DB i.tag filter:      ${iTagSet.size} subs`);
  console.log(`DB s.tag filter:      ${sTagSet.size} subs`);
  console.log(`CRM ∩ DB total:       ${crmIds.filter(id => totalSet.has(id)).length}`);
  console.log(`CRM ∩ DB i.tag:       ${crmIds.filter(id => iTagSet.has(id)).length}`);
  console.log(`CRM ∩ DB s.tag:       ${crmIds.filter(id => sTagSet.has(id)).length}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});
