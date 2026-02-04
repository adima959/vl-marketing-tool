import { executeMariaDBQuery } from '@/lib/server/mariadb';

/**
 * Debug Dec 2025 count mismatch
 */

async function debug() {
  console.log('Debugging Dec 2025 count mismatch...\n');

  // First, let's see how many invoices exist for Dec 2025 subscriptions
  console.log('1. Count all invoices for subscriptions created in Dec 2025:');
  const query1 = `
    SELECT COUNT(DISTINCT i.id) as count
    FROM subscription s
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE DATE(s.date_create) BETWEEN '2025-12-01' AND '2025-12-31'
  `;
  const result1 = await executeMariaDBQuery<{ count: number }>(query1, []);
  console.log(`   Result: ${result1[0].count} invoices\n`);

  // Now with s.deleted = 0
  console.log('2. Count with s.deleted = 0:');
  const query2 = `
    SELECT COUNT(DISTINCT i.id) as count
    FROM subscription s
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE DATE(s.date_create) BETWEEN '2025-12-01' AND '2025-12-31'
      AND s.deleted = 0
  `;
  const result2 = await executeMariaDBQuery<{ count: number }>(query2, []);
  console.log(`   Result: ${result2[0].count} invoices\n`);

  // Now with i.tag filter
  console.log('3. Count with s.deleted = 0 AND i.tag filter:');
  const query3 = `
    SELECT COUNT(DISTINCT i.id) as count
    FROM subscription s
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE DATE(s.date_create) BETWEEN '2025-12-01' AND '2025-12-31'
      AND s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
  `;
  const result3 = await executeMariaDBQuery<{ count: number }>(query3, []);
  console.log(`   Result: ${result3[0].count} invoices\n`);

  // Now let's see what the detail query returns (using s.date_create BETWEEN with times)
  console.log('4. Count using detail query date format (BETWEEN with times):');
  const query4 = `
    SELECT COUNT(DISTINCT i.id) as count
    FROM subscription s
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE s.date_create BETWEEN '2025-12-01 00:00:00' AND '2025-12-31 23:59:59'
      AND s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
  `;
  const result4 = await executeMariaDBQuery<{ count: number }>(query4, []);
  console.log(`   Result: ${result4[0].count} invoices\n`);

  // Let's see the actual invoices
  console.log('5. List all invoices (with details):');
  const query5 = `
    SELECT
      i.id as invoice_id,
      s.id as subscription_id,
      s.date_create,
      DATE(s.date_create) as date_only,
      s.deleted,
      i.tag
    FROM subscription s
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE s.date_create BETWEEN '2025-12-01 00:00:00' AND '2025-12-31 23:59:59'
    ORDER BY i.id
  `;
  const result5 = await executeMariaDBQuery<any>(query5, []);
  console.log(`   Found ${result5.length} invoices:`);
  result5.forEach(row => {
    console.log(`   - Invoice ${row.invoice_id}, Sub ${row.subscription_id}, Date: ${row.date_create}, DATE(): ${row.date_only}, Deleted: ${row.deleted}, Tag: ${row.tag || 'NULL'}`);
  });

  console.log('\nSummary:');
  console.log(`All invoices: ${result1[0].count}`);
  console.log(`With s.deleted=0: ${result2[0].count}`);
  console.log(`With s.deleted=0 + i.tag filter: ${result3[0].count}`);
  console.log(`Detail query format: ${result4[0].count}`);
}

debug()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
