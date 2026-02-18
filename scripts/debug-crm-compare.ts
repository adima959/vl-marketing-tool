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

// CRM's 39 trial rows (sub IDs as listed by user, including duplicates)
const crmTrialSubIds = [
  318331, 318332, 318334, 318336, 318112, 318113, 318337, 318339,
  318340, 316895, 318341, 318343, 318344, 318347, 318349, 318350,
  318351, 315878, 315876, 318352, 318354, 318355, 318356, 318357,
  318358, 318359, 318360, 318361, 318362, 318363, 318364, 318366,
  318367, 318368, 318371, 318372, 318373,
  318112, 318113, // duplicates in CRM list
];

const uniqueIds = [...new Set(crmTrialSubIds)];
const ph = uniqueIds.map(() => '?').join(',');

async function main() {
  const [rows] = await maria.execute(`
    SELECT s.id AS sub_id, s.customer_id,
           DATE(s.date_create) AS date_create,
           DATE(i_any.invoice_date) AS trial_invoice_date,
           i_any.deleted AS invoice_deleted,
           LOWER(c.country) AS country,
           COALESCE(sr_inv.source, sr_sub.source) AS source
    FROM subscription s
    LEFT JOIN customer c ON c.id = s.customer_id
    LEFT JOIN invoice i_any ON i_any.id = (
      SELECT MIN(i2.id) FROM invoice i2
      WHERE i2.subscription_id = s.id AND i2.type = 1
    )
    LEFT JOIN invoice i_first ON i_first.subscription_id = s.id AND i_first.type = 1
      AND i_first.id = (SELECT MIN(i3.id) FROM invoice i3 WHERE i3.subscription_id = s.id AND i3.type = 1)
    LEFT JOIN source sr_inv ON sr_inv.id = i_first.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.id IN (${ph})
    ORDER BY s.id
  `, uniqueIds);

  const data = rows as any[];

  const inDashboard: any[] = [];
  const outOfRange: any[] = [];
  const deletedInvoice: any[] = [];

  for (const r of data) {
    const d = r.date_create instanceof Date ? r.date_create : new Date(r.date_create);
    const created = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    r._created = created;
    const invD = r.trial_invoice_date instanceof Date ? r.trial_invoice_date : new Date(r.trial_invoice_date);
    r._invoiceDate = invD.getFullYear() + '-' + String(invD.getMonth() + 1).padStart(2, '0') + '-' + String(invD.getDate()).padStart(2, '0');
    const isFeb16 = created === '2026-02-16';
    const isDeleted = r.invoice_deleted === 1;

    if (isFeb16 === false) {
      outOfRange.push(r);
    } else if (isDeleted) {
      deletedInvoice.push(r);
    } else {
      inDashboard.push(r);
    }
  }

  console.log('=== CRM 39 trials for Feb 16 — cross-referenced with dashboard ===');
  console.log(`\nTotal unique sub IDs in CRM list: ${data.length}`);
  console.log(`Duplicate rows in CRM list: ${crmTrialSubIds.length - uniqueIds.length}`);
  console.log(`CRM total: ${crmTrialSubIds.length}`);

  console.log(`\n--- IN dashboard (created Feb 16, non-deleted trial invoice): ${inDashboard.length} ---`);

  console.log(`\n--- NOT in dashboard — created on different date: ${outOfRange.length} ---`);
  for (const r of outOfRange) {
    console.log(`  sub ${r.sub_id} | cust ${r.customer_id} | created=${r._created} | invoice_date=${r._invoiceDate} | ${r.country} | ${r.source}`);
  }

  console.log(`\n--- NOT in dashboard — deleted trial invoice: ${deletedInvoice.length} ---`);
  for (const r of deletedInvoice) {
    console.log(`  sub ${r.sub_id} | cust ${r.customer_id} | created=${r._created} | invoice_date=${r._invoiceDate} | deleted=${r.invoice_deleted} | ${r.country} | ${r.source}`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`CRM trial rows:                     ${crmTrialSubIds.length}`);
  console.log(`  Unique sub IDs:                   ${data.length}`);
  console.log(`  + duplicate rows:                 ${crmTrialSubIds.length - uniqueIds.length}`);
  console.log(`Dashboard trials (created Feb 16):  ${inDashboard.length}`);
  console.log(`Gap breakdown:`);
  console.log(`  Out-of-range subs (diff date):    ${outOfRange.length}`);
  console.log(`  Deleted trial invoices:            ${deletedInvoice.length}`);
  console.log(`  Duplicate rows in CRM:            ${crmTrialSubIds.length - uniqueIds.length}`);
  console.log(`  Total gap:                        ${outOfRange.length + deletedInvoice.length + (crmTrialSubIds.length - uniqueIds.length)}`);
  console.log(`  Expected: 39 - 32 =               7`);

  await maria.end();
}
main().catch(e => { console.error(e); process.exit(1); });
