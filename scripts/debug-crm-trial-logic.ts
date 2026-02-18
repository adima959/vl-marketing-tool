/**
 * Debug: Investigate what date field the CRM external system uses
 * to associate 5 out-of-range subs with Feb 16.
 *
 * These subs are in the CRM's Feb 16 trial list but were NOT created on Feb 16:
 *   315876 (created Jan 1), 315878 (created Jan 1),
 *   316895 (created Jan 20), 318112 (created Feb 11), 318113 (created Feb 11)
 *
 * Their trial invoice_dates are also NOT Feb 16 (Jan 8, Jan 22, Feb 12).
 * So CRM must use a different table/field.
 *
 * Run: npx tsx scripts/debug-crm-trial-logic.ts
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env.local' });

const maria = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectTimeout: 30000,
});

async function mq<T>(sql: string, p: unknown[] = []): Promise<T[]> {
  const [rows] = await maria.execute(sql, p);
  return rows as T[];
}

const outOfRangeSubIds = [315876, 315878, 316895, 318112, 318113];
const ph = outOfRangeSubIds.map(() => '?').join(',');

async function main(): Promise<void> {
  // 1. Check invoice table columns
  console.log('=== Invoice table columns ===\n');
  const invoiceCols = await mq<{ Field: string; Type: string }>('SHOW COLUMNS FROM invoice');
  for (const c of invoiceCols) {
    if (c.Field.includes('date') || c.Field.includes('time') || c.Field.includes('create') || c.Field.includes('process')) {
      console.log(`  ${c.Field}: ${c.Type}`);
    }
  }

  // 2. Check if invoice_proccessed table exists and its columns
  console.log('\n=== invoice_proccessed table columns ===\n');
  try {
    const ipCols = await mq<{ Field: string; Type: string }>('SHOW COLUMNS FROM invoice_proccessed');
    for (const c of ipCols) {
      console.log(`  ${c.Field}: ${c.Type}`);
    }
  } catch {
    console.log('  Table does not exist or is not accessible');
  }

  // 3. Get ALL invoices for the 5 out-of-range subs
  console.log('\n=== All invoices for out-of-range subs ===\n');
  const allInvoices = await mq<Record<string, unknown>>(`
    SELECT i.id, i.subscription_id, i.type, i.invoice_date,
           i.deleted, i.source_id
    FROM invoice i
    WHERE i.subscription_id IN (${ph})
    ORDER BY i.subscription_id, i.id
  `, outOfRangeSubIds);

  for (const inv of allInvoices) {
    const invDate = String(inv.invoice_date).slice(0, 10);
    console.log(
      `  inv ${inv.id} | sub ${inv.subscription_id} | type=${inv.type}` +
      ` | invoice_date=${invDate} | deleted=${inv.deleted}`
    );
  }

  // 4. Check invoice_proccessed for these subs — look for Feb 16 activity
  console.log('\n=== invoice_proccessed for out-of-range subs ===\n');
  try {
    const processed = await mq<Record<string, unknown>>(`
      SELECT ip.*
      FROM invoice_proccessed ip
      INNER JOIN invoice i ON i.id = ip.invoice_id
      WHERE i.subscription_id IN (${ph})
      ORDER BY i.subscription_id, ip.id
    `, outOfRangeSubIds);

    if (processed.length === 0) {
      console.log('  No rows found');
    } else {
      for (const r of processed) {
        const cols = Object.entries(r).map(([k, v]) => `${k}=${v}`).join(' | ');
        console.log(`  ${cols}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Error querying invoice_proccessed: ${msg}`);
  }

  // 5. Check subscription table for any date fields we might have missed
  console.log('\n=== Subscription date-related columns ===\n');
  const subCols = await mq<{ Field: string; Type: string }>('SHOW COLUMNS FROM subscription');
  for (const c of subCols) {
    if (c.Field.includes('date') || c.Field.includes('time') || c.Field.includes('mark') || c.Field.includes('approv') || c.Field.includes('hold')) {
      console.log(`  ${c.Field}: ${c.Type}`);
    }
  }

  // 6. Get subscription details with ALL date fields
  console.log('\n=== Subscription date fields for out-of-range subs ===\n');
  const subDetails = await mq<Record<string, unknown>>(`
    SELECT s.*
    FROM subscription s
    WHERE s.id IN (${ph})
    ORDER BY s.id
  `, outOfRangeSubIds);

  for (const s of subDetails) {
    const dateFields = Object.entries(s)
      .filter(([k, v]) => {
        if (v === null || v === 0 || v === '') return false;
        return k.includes('date') || k.includes('time') || k.includes('mark')
          || k.includes('approv') || k.includes('hold') || k.includes('process');
      })
      .map(([k, v]) => `${k}=${String(v).slice(0, 19)}`)
      .join(' | ');
    console.log(`  sub ${s.id}: ${dateFields}`);
  }

  // 7. Check if there's a "marked" or "approved" date that falls on Feb 16
  console.log('\n=== Looking for Feb 16 dates in invoice fields ===\n');
  // First get all date columns from invoice
  const allDateCols = invoiceCols
    .filter(c => c.Type.includes('date') || c.Type.includes('time'))
    .map(c => c.Field);
  console.log(`  Date columns in invoice: ${allDateCols.join(', ')}`);

  if (allDateCols.length > 0) {
    const selectCols = allDateCols.map(c => `i.${c}`).join(', ');
    const invoiceDates = await mq<Record<string, unknown>>(`
      SELECT i.id, i.subscription_id, i.type, ${selectCols}
      FROM invoice i
      WHERE i.subscription_id IN (${ph})
        AND i.type = 1
      ORDER BY i.subscription_id, i.id
    `, outOfRangeSubIds);

    for (const inv of invoiceDates) {
      const dateVals = Object.entries(inv)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => {
          const str = String(v);
          const isFeb16 = str.includes('2026-02-16') || str.includes('Feb 16');
          return `${k}=${str.slice(0, 19)}${isFeb16 ? ' <<<FEB16' : ''}`;
        })
        .join(' | ');
      console.log(`  ${dateVals}`);
    }
  }

  await maria.end();
}

main().catch(err => { console.error(err); process.exit(1); });
