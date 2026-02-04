import { executeMariaDBQuery } from '@/lib/server/mariadb';

/**
 * Debug script to investigate approval rate count mismatch
 * Compares approval rate aggregation query vs detail query for Dec 2025
 */

async function debugApprovalRateCount() {
  console.log('='.repeat(80));
  console.log('DEBUG: Approval Rate Count Mismatch - Dec 2025');
  console.log('='.repeat(80));

  const periodStart = '2025-12-01';
  const periodEnd = '2025-12-31';

  console.log(`\nPeriod: ${periodStart} to ${periodEnd}`);
  console.log('-'.repeat(80));

  // Query 1: Approval rate aggregation query (what shows "1" in the table)
  console.log('\n1. APPROVAL RATE AGGREGATION QUERY:');
  console.log('-'.repeat(80));

  const approvalRateQuery = `
    SELECT
      COUNT(DISTINCT CASE
        WHEN DATE(s.date_create) BETWEEN ? AND ?
        THEN i.id
      END) as trials,
      COUNT(DISTINCT CASE
        WHEN DATE(s.date_create) BETWEEN ? AND ?
        AND i.is_marked = 1
        THEN i.id
      END) as approved
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
  `;

  const approvalRateParams = [periodStart, periodEnd, periodStart, periodEnd];

  console.log('Query:', approvalRateQuery);
  console.log('Params:', approvalRateParams);

  const approvalRateResult = await executeMariaDBQuery<{ trials: number; approved: number }>(
    approvalRateQuery,
    approvalRateParams
  );

  console.log('\nResult:', approvalRateResult[0]);

  // Query 2: Detail query WITH excludeDeleted (what should show in modal)
  console.log('\n2. DETAIL QUERY (with excludeDeleted=true):');
  console.log('-'.repeat(80));

  const detailQuery = `
    SELECT
      i.id as invoice_id,
      s.id as subscription_id,
      CONCAT(c.first_name, ' ', c.last_name) as customer_name,
      i.order_date,
      s.date_create as subscription_date,
      DATE(s.date_create) as subscription_date_only,
      s.deleted as is_deleted,
      i.tag,
      i.is_marked
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
    GROUP BY i.id
    ORDER BY i.order_date DESC
  `;

  const detailParams = [`${periodStart} 00:00:00`, `${periodEnd} 23:59:59`];

  console.log('Query:', detailQuery);
  console.log('Params:', detailParams);

  const detailResult = await executeMariaDBQuery<any>(detailQuery, detailParams);

  console.log(`\nResult: ${detailResult.length} records`);
  console.log('Records:');
  detailResult.forEach((row, idx) => {
    console.log(`  ${idx + 1}. Invoice ${row.invoice_id}, Sub ${row.subscription_id}, Date: ${row.subscription_date_only}, Deleted: ${row.is_deleted}, Tag: ${row.tag || 'NULL'}, Marked: ${row.is_marked}`);
  });

  // Query 3: Detail query WITHOUT filters (to see all records)
  console.log('\n3. DETAIL QUERY (without filters - all records):');
  console.log('-'.repeat(80));

  const detailQueryNoFilter = `
    SELECT
      i.id as invoice_id,
      s.id as subscription_id,
      CONCAT(c.first_name, ' ', c.last_name) as customer_name,
      i.order_date,
      s.date_create as subscription_date,
      DATE(s.date_create) as subscription_date_only,
      s.deleted as is_deleted,
      i.tag,
      i.is_marked
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.date_create BETWEEN ? AND ?
    GROUP BY i.id
    ORDER BY i.order_date DESC
  `;

  const detailResultNoFilter = await executeMariaDBQuery<any>(detailQueryNoFilter, detailParams);

  console.log(`\nResult: ${detailResultNoFilter.length} records`);
  console.log('Records:');
  detailResultNoFilter.forEach((row, idx) => {
    console.log(`  ${idx + 1}. Invoice ${row.invoice_id}, Sub ${row.subscription_id}, Date: ${row.subscription_date_only}, Deleted: ${row.is_deleted}, Tag: ${row.tag || 'NULL'}, Marked: ${row.is_marked}`);
  });

  // Compare
  console.log('\n4. COMPARISON:');
  console.log('-'.repeat(80));
  console.log(`Approval Rate Count: ${approvalRateResult[0]?.trials || 0} trials`);
  console.log(`Detail Query (filtered): ${detailResult.length} records`);
  console.log(`Detail Query (unfiltered): ${detailResultNoFilter.length} records`);
  console.log(`\nDiscrepancy: ${detailResultNoFilter.length - detailResult.length} records filtered out`);

  // Analyze differences
  if (approvalRateResult[0]?.trials !== detailResult.length) {
    console.log('\n⚠️  MISMATCH FOUND!');
    console.log(`Expected: ${approvalRateResult[0]?.trials} trials`);
    console.log(`Got: ${detailResult.length} records`);

    // Check the date filtering difference
    console.log('\n5. CHECKING DATE FILTERING DIFFERENCE:');
    console.log('-'.repeat(80));
    console.log('Approval rate uses: DATE(s.date_create) BETWEEN \'2025-12-01\' AND \'2025-12-31\'');
    console.log('Detail query uses: s.date_create BETWEEN \'2025-12-01 00:00:00\' AND \'2025-12-31 23:59:59\'');
    console.log('\nThese SHOULD be equivalent, but let\'s check subscription dates:');

    detailResultNoFilter.forEach((row) => {
      const subDate = new Date(row.subscription_date);
      console.log(`  Sub ${row.subscription_id}: ${row.subscription_date} (DATE: ${row.subscription_date_only})`);
    });
  } else {
    console.log('\n✅ Counts match!');
  }

  console.log('\n' + '='.repeat(80));
}

// Run the debug
debugApprovalRateCount()
  .then(() => {
    console.log('\nDebug complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
