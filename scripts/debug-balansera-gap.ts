/**
 * Debug: Why does customer count show 234 for Balansera in marketing report but CRM shows 239?
 * Dimensions: Country=DK, Network=Google Ads, Product=Balansera
 * Date range: 12/01/2026 - 09/02/2026
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const START = '2026-01-12 00:00:00';
const END = '2026-02-09 23:59:59';
const PRODUCT_LIKE = '%Balansera%';

async function main(): Promise<void> {
  const maria = await mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
  });

  console.log('=== DEBUG: Balansera Customer Count Gap (234 vs 239) ===\n');
  console.log(`Date range: ${START} to ${END}`);
  console.log(`Product: ${PRODUCT_LIKE}\n`);

  // Step 1: Total customers for this product + source (no tracking filter)
  const [total] = await maria.query(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as customers,
      COUNT(DISTINCT s.id) as subscriptions
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND EXISTS (
        SELECT 1 FROM invoice_product ip
        INNER JOIN product p ON p.id = ip.product_id
        WHERE ip.invoice_id = i.id AND p.product_name LIKE ?
      )
  `, [START, END, PRODUCT_LIKE]);
  console.log('1. Total (source=adwords/google, product filter, no tracking req):');
  console.log('   ', (total as any)[0]);

  // Step 2: With full tracking validation (old behavior)
  const [withTracking] = await maria.query(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as customers,
      COUNT(DISTINCT s.id) as subscriptions
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null'
      AND s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null'
      AND s.tracking_id IS NOT NULL AND s.tracking_id != 'null'
      AND EXISTS (
        SELECT 1 FROM invoice_product ip
        INNER JOIN product p ON p.id = ip.product_id
        WHERE ip.invoice_id = i.id AND p.product_name LIKE ?
      )
  `, [START, END, PRODUCT_LIKE]);
  console.log('\n2. With full tracking validation (old behavior):');
  console.log('   ', (withTracking as any)[0]);

  // Step 3: Without tracking validation (new behavior after our change)
  const [withoutTracking] = await maria.query(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as customers,
      COUNT(DISTINCT s.id) as subscriptions
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND EXISTS (
        SELECT 1 FROM invoice_product ip
        INNER JOIN product p ON p.id = ip.product_id
        WHERE ip.invoice_id = i.id AND p.product_name LIKE ?
      )
  `, [START, END, PRODUCT_LIKE]);
  console.log('\n3. Without tracking validation (new behavior):');
  console.log('   ', (withoutTracking as any)[0]);

  // Step 4: Tracking breakdown — how many have partial tracking?
  const [trackingBreakdown] = await maria.query(`
    SELECT
      CASE
        WHEN (s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null')
         AND (s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null')
         AND (s.tracking_id IS NOT NULL AND s.tracking_id != 'null')
        THEN 'full'
        WHEN (s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null')
         AND (s.tracking_id_2 IS NOT NULL AND s.tracking_id_2 != 'null')
        THEN 'campaign+adset'
        WHEN (s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 != 'null')
        THEN 'campaign-only'
        ELSE 'none'
      END AS tracking_tier,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as customers,
      COUNT(DISTINCT s.id) as subscriptions
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND EXISTS (
        SELECT 1 FROM invoice_product ip
        INNER JOIN product p ON p.id = ip.product_id
        WHERE ip.invoice_id = i.id AND p.product_name LIKE ?
      )
    GROUP BY tracking_tier
  `, [START, END, PRODUCT_LIKE]);
  console.log('\n4. Tracking tier breakdown:');
  for (const row of trackingBreakdown as any[]) {
    console.log(`   ${row.tracking_tier}: ${row.customers} customers, ${row.subscriptions} subs`);
  }

  // Step 5: Check what the marketing report's CRM query actually returns
  // This simulates the grouped query with source in GROUP BY
  const [grouped] = await maria.query(`
    SELECT
      s.tracking_id_4 AS campaign_id,
      s.tracking_id_2 AS adset_id,
      s.tracking_id AS ad_id,
      sr.source AS source,
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as customer_count,
      COUNT(DISTINCT s.id) as subscription_count
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
      AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND EXISTS (
        SELECT 1 FROM invoice_product ip
        INNER JOIN product p ON p.id = ip.product_id
        WHERE ip.invoice_id = i.id AND p.product_name LIKE ?
      )
    GROUP BY s.tracking_id_4, s.tracking_id_2, s.tracking_id, sr.source
    HAVING customer_count > 0
  `, [START, END, PRODUCT_LIKE]);
  const groupedRows = grouped as any[];
  const totalFromGrouped = groupedRows.reduce((sum: number, r: any) => sum + Number(r.customer_count), 0);
  const adwordsRows = groupedRows.filter((r: any) => r.source && ['adwords', 'google'].includes(r.source.toLowerCase()));
  const adwordsTotal = adwordsRows.reduce((sum: number, r: any) => sum + Number(r.customer_count), 0);
  console.log(`\n5. Grouped by tracking tuple + source (HAVING customer_count > 0):`);
  console.log(`   Total rows: ${groupedRows.length}, total customers (sum): ${totalFromGrouped}`);
  console.log(`   Adwords/Google rows: ${adwordsRows.length}, customers (sum): ${adwordsTotal}`);

  // Step 6: Check for customer_id overlap across tracking tuples
  // (same customer appearing in multiple groups = sum > DISTINCT count)
  const [distinctCheck] = await maria.query(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as distinct_customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND EXISTS (
        SELECT 1 FROM invoice_product ip
        INNER JOIN product p ON p.id = ip.product_id
        WHERE ip.invoice_id = i.id AND p.product_name LIKE ?
      )
  `, [START, END, PRODUCT_LIKE]);
  const distinctCustomers = (distinctCheck as any)[0].distinct_customers;
  console.log(`\n6. DISTINCT customer check:`);
  console.log(`   SUM across groups: ${adwordsTotal}`);
  console.log(`   COUNT(DISTINCT customer_id): ${distinctCustomers}`);
  if (adwordsTotal !== distinctCustomers) {
    console.log(`   ⚠️  OVERLAP: ${adwordsTotal - distinctCustomers} customers appear in multiple tracking tuples`);
  } else {
    console.log(`   ✅ No overlap — SUM matches DISTINCT`);
  }

  // Step 7: What does the CRM show as 239? Direct simple count
  const [directCrm] = await maria.query(`
    SELECT COUNT(DISTINCT c.id) as customers
    FROM subscription s
    INNER JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND DATE(c.date_registered) = DATE(s.date_create)
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
  `, [START, END]);
  console.log(`\n7. Direct CRM (no product filter, no tracking req): ${(directCrm as any)[0].customers} customers`);

  // Step 8: With product filter but via subscription product (not invoice product)
  const [subProduct] = await maria.query(`
    SELECT COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) as customers
    FROM subscription s
    LEFT JOIN customer c ON s.customer_id = c.id
    LEFT JOIN source sr ON sr.id = s.source_id
    LEFT JOIN product p ON p.id = s.product_id
    WHERE s.date_create BETWEEN ? AND ?
      AND (s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')
      AND LOWER(sr.source) IN ('adwords', 'google')
      AND p.product_name LIKE ?
  `, [START, END, PRODUCT_LIKE]);
  console.log(`\n8. Via subscription.product_id (not invoice): ${(subProduct as any)[0].customers} customers`);

  await maria.end();
}

main().catch(console.error);
