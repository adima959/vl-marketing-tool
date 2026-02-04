import { executeMariaDBQuery } from '@/lib/server/mariadb';

async function debug() {
  try {
    console.log('Testing queries...\n');

    // Test 1: Simple count
    console.log('1. Total invoices type=1:');
    const q1 = 'SELECT COUNT(*) as count FROM invoice WHERE type = 1';
    const r1 = await executeMariaDBQuery<{count: number}>(q1, []);
    console.log(`   ${r1[0].count} invoices\n`);

    // Test 2: With date filter using >= and <=
    console.log('2. Invoices for Dec 2025 subscriptions (using >= <=):');
    const q2 = `
      SELECT COUNT(DISTINCT i.id) as count
      FROM subscription s
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      WHERE s.date_create >= '2025-12-01 00:00:00'
        AND s.date_create <= '2025-12-31 23:59:59'
    `;
    const r2 = await executeMariaDBQuery<{count: number}>(q2, []);
    console.log(`   ${r2[0].count} invoices\n`);

    // Test 3: Add s.deleted filter
    console.log('3. With s.deleted = 0:');
    const q3 = `
      SELECT COUNT(DISTINCT i.id) as count
      FROM subscription s
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      WHERE s.date_create >= '2025-12-01 00:00:00'
        AND s.date_create <= '2025-12-31 23:59:59'
        AND s.deleted = 0
    `;
    const r3 = await executeMariaDBQuery<{count: number}>(q3, []);
    console.log(`   ${r3[0].count} invoices\n`);

    // Test 4: Add i.tag filter
    console.log('4. With i.tag filter:');
    const q4 = `
      SELECT COUNT(DISTINCT i.id) as count
      FROM subscription s
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      WHERE s.date_create >= '2025-12-01 00:00:00'
        AND s.date_create <= '2025-12-31 23:59:59'
        AND s.deleted = 0
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
    `;
    const r4 = await executeMariaDBQuery<{count: number}>(q4, []);
    console.log(`   ${r4[0].count} invoices\n`);

    // Test 5: Show actual records
    console.log('5. Actual records:');
    const q5 = `
      SELECT
        i.id,
        s.id as sub_id,
        s.date_create,
        s.deleted,
        i.tag,
        i.is_marked
      FROM subscription s
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      WHERE s.date_create >= '2025-12-01 00:00:00'
        AND s.date_create <= '2025-12-31 23:59:59'
      ORDER BY i.id
      LIMIT 20
    `;
    const r5 = await executeMariaDBQuery<any>(q5, []);
    console.log(`   Found ${r5.length} records (showing up to 20):`);
    r5.forEach(row => {
      console.log(`   Invoice ${row.id}, Sub ${row.sub_id}, Date: ${row.date_create}, Deleted: ${row.deleted}, Tag: ${row.tag || 'NULL'}, Marked: ${row.is_marked}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

debug().then(() => process.exit(0));
