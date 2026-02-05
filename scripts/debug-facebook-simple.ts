import { executeMariaDBQuery } from '@/lib/server/mariadb';

/**
 * Simple debug script - one query at a time
 */

async function debug() {
  const periodStart = '2025-12-01';
  const periodEnd = '2025-12-14';

  console.log('=== DEBUG: Facebook Dec 1-14 ===\n');

  // Query 1: Basic count with all filters (what approval rate uses)
  console.log('1. Approval Rate count (with all filters):');
  try {
    const q1 = `
      SELECT COUNT(DISTINCT i.id) as trials
      FROM subscription s
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE s.deleted = 0
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
        AND DATE(s.date_create) BETWEEN ? AND ?
        AND sr.source = 'Facebook'
    `;
    const r1 = await executeMariaDBQuery<{ trials: number }>(q1, [periodStart, periodEnd]);
    console.log(`   Result: ${r1[0]?.trials} trials\n`);
  } catch (e) {
    console.log(`   Error: ${e}\n`);
  }

  // Query 2: Without tag filter
  console.log('2. Without tag filter:');
  try {
    const q2 = `
      SELECT COUNT(DISTINCT i.id) as trials
      FROM subscription s
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE s.deleted = 0
        AND DATE(s.date_create) BETWEEN ? AND ?
        AND sr.source = 'Facebook'
    `;
    const r2 = await executeMariaDBQuery<{ trials: number }>(q2, [periodStart, periodEnd]);
    console.log(`   Result: ${r2[0]?.trials} trials\n`);
  } catch (e) {
    console.log(`   Error: ${e}\n`);
  }

  // Query 3: Count records with parent-sub-id tag
  console.log('3. Records with parent-sub-id tag:');
  try {
    const q3 = `
      SELECT COUNT(DISTINCT i.id) as trials
      FROM subscription s
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE s.deleted = 0
        AND DATE(s.date_create) BETWEEN ? AND ?
        AND sr.source = 'Facebook'
        AND i.tag LIKE '%parent-sub-id=%'
    `;
    const r3 = await executeMariaDBQuery<{ trials: number }>(q3, [periodStart, periodEnd]);
    console.log(`   Result: ${r3[0]?.trials} records filtered out by tag\n`);
  } catch (e) {
    console.log(`   Error: ${e}\n`);
  }

  // Query 4: Count subscriptions instead of invoices
  console.log('4. Count subscriptions (not invoices):');
  try {
    const q4 = `
      SELECT COUNT(DISTINCT s.id) as subs
      FROM subscription s
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE s.deleted = 0
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
        AND DATE(s.date_create) BETWEEN ? AND ?
        AND sr.source = 'Facebook'
    `;
    const r4 = await executeMariaDBQuery<{ subs: number }>(q4, [periodStart, periodEnd]);
    console.log(`   Result: ${r4[0]?.subs} subscriptions\n`);
  } catch (e) {
    console.log(`   Error: ${e}\n`);
  }

  // Query 5: Show actual tag values
  console.log('5. Sample of filtered tags:');
  try {
    const q5 = `
      SELECT i.id, i.tag, s.date_create
      FROM subscription s
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE s.deleted = 0
        AND DATE(s.date_create) BETWEEN ? AND ?
        AND sr.source = 'Facebook'
        AND i.tag LIKE '%parent-sub-id=%'
      LIMIT 10
    `;
    const r5 = await executeMariaDBQuery<any>(q5, [periodStart, periodEnd]);
    r5.forEach((row: any) => {
      console.log(`   Invoice ${row.id}: tag="${row.tag}"`);
    });
    if (r5.length === 0) console.log('   No records found');
    console.log('');
  } catch (e) {
    console.log(`   Error: ${e}\n`);
  }

  // Query 6: Without deleted filter
  console.log('6. Without deleted filter:');
  try {
    const q6 = `
      SELECT COUNT(DISTINCT i.id) as trials
      FROM subscription s
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
        AND DATE(s.date_create) BETWEEN ? AND ?
        AND sr.source = 'Facebook'
    `;
    const r6 = await executeMariaDBQuery<{ trials: number }>(q6, [periodStart, periodEnd]);
    console.log(`   Result: ${r6[0]?.trials} trials\n`);
  } catch (e) {
    console.log(`   Error: ${e}\n`);
  }

  // Query 7: Check for multiple invoices per subscription
  console.log('7. Subscriptions with multiple trial invoices:');
  try {
    const q7 = `
      SELECT s.id as sub_id, COUNT(i.id) as invoice_count
      FROM subscription s
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE s.deleted = 0
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
        AND DATE(s.date_create) BETWEEN ? AND ?
        AND sr.source = 'Facebook'
      GROUP BY s.id
      HAVING COUNT(i.id) > 1
    `;
    const r7 = await executeMariaDBQuery<any>(q7, [periodStart, periodEnd]);
    console.log(`   Found: ${r7.length} subscriptions with multiple invoices`);
    r7.slice(0, 5).forEach((row: any) => {
      console.log(`   Sub ${row.sub_id}: ${row.invoice_count} invoices`);
    });
    console.log('');
  } catch (e) {
    console.log(`   Error: ${e}\n`);
  }

  console.log('=== END DEBUG ===');
}

debug()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  });
