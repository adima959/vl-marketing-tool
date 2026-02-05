import { executeMariaDBQuery } from '@/lib/server/mariadb';

/**
 * Debug script to find the 4 missing Facebook records in Dec 1-14
 * CRM shows 124, Approval Rate shows 120
 */

async function debugFacebookDec() {
  console.log('='.repeat(80));
  console.log('DEBUG: Facebook Dec 1-14 Discrepancy (124 CRM vs 120 Report)');
  console.log('='.repeat(80));

  const periodStart = '2025-12-01';
  const periodEnd = '2025-12-14';

  // Query 1: What the Approval Rate query counts
  console.log('\n1. APPROVAL RATE QUERY (how it counts):');
  console.log('-'.repeat(80));

  const approvalRateQuery = `
    SELECT
      sr.source AS dimension_value,
      COUNT(DISTINCT CASE
        WHEN DATE(s.date_create) BETWEEN ? AND ?
        THEN i.id
      END) as trials
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
    GROUP BY sr.source
    HAVING COUNT(DISTINCT CASE WHEN DATE(s.date_create) BETWEEN ? AND ? THEN i.id END) > 0
    ORDER BY trials DESC
  `;

  const approvalRateParams = [periodStart, periodEnd, periodStart, periodEnd];
  const approvalRateResult = await executeMariaDBQuery<{ dimension_value: string | null; trials: number }>(
    approvalRateQuery,
    approvalRateParams
  );

  console.log('Results by source:');
  approvalRateResult.forEach((row) => {
    if (row.dimension_value?.toLowerCase().includes('facebook')) {
      console.log(`  → ${row.dimension_value}: ${row.trials} trials (Facebook-related)`);
    }
  });

  const facebookTrials = approvalRateResult
    .filter(r => r.dimension_value?.toLowerCase().includes('facebook'))
    .reduce((sum, r) => sum + r.trials, 0);
  console.log(`\nTotal Facebook-related: ${facebookTrials} trials`);

  // Query 2: Count with Facebook filter (matching what the CRM might show)
  console.log('\n2. FACEBOOK-SPECIFIC COUNT:');
  console.log('-'.repeat(80));

  const facebookQuery = `
    SELECT
      COUNT(DISTINCT i.id) as trials
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND DATE(s.date_create) BETWEEN ? AND ?
      AND sr.source = 'Facebook'
  `;

  const facebookResult = await executeMariaDBQuery<{ trials: number }>(
    facebookQuery,
    [periodStart, periodEnd]
  );
  console.log(`Facebook exact match: ${facebookResult[0]?.trials} trials`);

  // Query 3: Count WITHOUT the tag filter
  console.log('\n3. WITHOUT TAG FILTER:');
  console.log('-'.repeat(80));

  const noTagFilterQuery = `
    SELECT
      COUNT(DISTINCT i.id) as trials
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.deleted = 0
      AND DATE(s.date_create) BETWEEN ? AND ?
      AND sr.source = 'Facebook'
  `;

  const noTagFilterResult = await executeMariaDBQuery<{ trials: number }>(
    noTagFilterQuery,
    [periodStart, periodEnd]
  );
  console.log(`Without tag filter: ${noTagFilterResult[0]?.trials} trials`);

  // Query 4: Count WITHOUT deleted filter
  console.log('\n4. WITHOUT DELETED FILTER:');
  console.log('-'.repeat(80));

  const noDeletedFilterQuery = `
    SELECT
      COUNT(DISTINCT i.id) as trials
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
    LEFT JOIN product p ON p.id = ip.product_id
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND DATE(s.date_create) BETWEEN ? AND ?
      AND sr.source = 'Facebook'
  `;

  const noDeletedFilterResult = await executeMariaDBQuery<{ trials: number }>(
    noDeletedFilterQuery,
    [periodStart, periodEnd]
  );
  console.log(`Without deleted filter: ${noDeletedFilterResult[0]?.trials} trials`);

  // Query 5: Count WITHOUT invoice_product join
  console.log('\n5. WITHOUT INVOICE_PRODUCT JOIN:');
  console.log('-'.repeat(80));

  const noIpJoinQuery = `
    SELECT
      COUNT(DISTINCT i.id) as trials
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND DATE(s.date_create) BETWEEN ? AND ?
      AND sr.source = 'Facebook'
  `;

  const noIpJoinResult = await executeMariaDBQuery<{ trials: number }>(
    noIpJoinQuery,
    [periodStart, periodEnd]
  );
  console.log(`Without invoice_product join: ${noIpJoinResult[0]?.trials} trials`);

  // Query 6: What records exist that ARE filtered out
  console.log('\n6. RECORDS FILTERED BY TAG:');
  console.log('-'.repeat(80));

  const filteredByTagQuery = `
    SELECT
      i.id as invoice_id,
      s.id as subscription_id,
      i.tag,
      s.date_create
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.deleted = 0
      AND DATE(s.date_create) BETWEEN ? AND ?
      AND sr.source = 'Facebook'
      AND i.tag LIKE '%parent-sub-id=%'
  `;

  const filteredByTagResult = await executeMariaDBQuery<any>(
    filteredByTagQuery,
    [periodStart, periodEnd]
  );
  console.log(`Records with parent-sub-id tag: ${filteredByTagResult.length}`);
  filteredByTagResult.forEach((row: any) => {
    console.log(`  Invoice ${row.invoice_id}, Sub ${row.subscription_id}, Tag: ${row.tag}`);
  });

  // Query 7: Check if invoice_product join affects count
  console.log('\n7. INVOICES WITHOUT PRODUCTS:');
  console.log('-'.repeat(80));

  const noProductsQuery = `
    SELECT
      i.id as invoice_id,
      s.id as subscription_id,
      s.date_create,
      (SELECT COUNT(*) FROM invoice_product WHERE invoice_id = i.id) as product_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND DATE(s.date_create) BETWEEN ? AND ?
      AND sr.source = 'Facebook'
    HAVING product_count = 0
  `;

  const noProductsResult = await executeMariaDBQuery<any>(
    noProductsQuery,
    [periodStart, periodEnd]
  );
  console.log(`Invoices without products: ${noProductsResult.length}`);

  // Query 8: Check CRM-like count (maybe counting subscriptions, not invoices?)
  console.log('\n8. COUNT SUBSCRIPTIONS (not invoices):');
  console.log('-'.repeat(80));

  const subscriptionCountQuery = `
    SELECT
      COUNT(DISTINCT s.id) as subscriptions
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    LEFT JOIN source sr ON sr.id = i.source_id
    WHERE s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND DATE(s.date_create) BETWEEN ? AND ?
      AND sr.source = 'Facebook'
  `;

  const subscriptionCountResult = await executeMariaDBQuery<{ subscriptions: number }>(
    subscriptionCountQuery,
    [periodStart, periodEnd]
  );
  console.log(`Subscription count: ${subscriptionCountResult[0]?.subscriptions}`);

  // Query 9: Check if there are invoices with NULL source that should be Facebook
  console.log('\n9. INVOICES WITH NULL SOURCE:');
  console.log('-'.repeat(80));

  const nullSourceQuery = `
    SELECT
      COUNT(DISTINCT i.id) as trials
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND DATE(s.date_create) BETWEEN ? AND ?
      AND i.source_id IS NULL
  `;

  const nullSourceResult = await executeMariaDBQuery<{ trials: number }>(
    nullSourceQuery,
    [periodStart, periodEnd]
  );
  console.log(`Invoices with NULL source_id: ${nullSourceResult[0]?.trials}`);

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY:');
  console.log('='.repeat(80));
  console.log(`CRM shows: 124`);
  console.log(`Approval Rate shows: 120`);
  console.log(`Difference: 4 records`);
  console.log(`\nPossible causes:`);
  console.log(`- Tag filter: ${filteredByTagResult.length} records filtered`);
  console.log(`- Invoices without products: ${noProductsResult.length}`);
  console.log(`- NULL source invoices: ${nullSourceResult[0]?.trials}`);
}

// Run
debugFacebookDec()
  .then(() => {
    console.log('\nDebug complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
