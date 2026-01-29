/**
 * Query MariaDB directly to verify CRM data for Balansera campaign
 */

import { executeMariaDBQuery } from '../lib/server/mariadb';

async function main() {
  console.log('🔍 Querying MariaDB CRM Database...\n');

  try {
    // Query 1: Count orders by source for Balansera on Jan 28, 2026
    console.log('1️⃣ CRM Orders by Source (Jan 28, 2026):');
    console.log('─'.repeat(80));

    const ordersBySource = await executeMariaDBQuery<{
      source: string;
      order_count: number;
      approved_count: number;
    }>(
      `SELECT
        source,
        COUNT(*) as order_count,
        COUNT(CASE WHEN validated_at IS NOT NULL THEN 1 END) as approved_count
      FROM vl_crm_orders
      WHERE DATE(created_at) = '2026-01-28'
        AND campaign_id IS NOT NULL
        AND campaign_id <> 'null'
        AND adset_id IS NOT NULL
        AND adset_id <> 'null'
        AND ad_id IS NOT NULL
        AND ad_id <> 'null'
      GROUP BY source
      ORDER BY order_count DESC`,
      []
    );

    console.table(ordersBySource);

    // Query 2: Orders for campaign_id 23291867037 specifically
    console.log('\n2️⃣ Orders for Campaign ID 23291867037 (Balansera_Dnk_IM_24_11):');
    console.log('─'.repeat(80));

    const balanseraOrders = await executeMariaDBQuery<{
      source: string;
      order_count: number;
      approved_count: number;
    }>(
      `SELECT
        source,
        COUNT(*) as order_count,
        COUNT(CASE WHEN validated_at IS NOT NULL THEN 1 END) as approved_count
      FROM vl_crm_orders
      WHERE DATE(created_at) = '2026-01-28'
        AND campaign_id = ?
      GROUP BY source
      ORDER BY order_count DESC`,
      ['23291867037']
    );

    console.table(balanseraOrders);

    // Query 3: Check subscription ID 4229 specifically
    console.log('\n3️⃣ Orders for Subscription ID 4229 (from your CRM screenshot):');
    console.log('─'.repeat(80));

    const subscription4229 = await executeMariaDBQuery<{
      source: string;
      campaign_id: string;
      order_count: number;
    }>(
      `SELECT
        source,
        campaign_id,
        COUNT(*) as order_count
      FROM vl_crm_orders
      WHERE DATE(created_at) = '2026-01-28'
        AND subscription_id = ?
      GROUP BY source, campaign_id
      ORDER BY order_count DESC`,
      [4229]
    );

    console.table(subscription4229);

    // Query 4: Sample rows for campaign 23291867037
    console.log('\n4️⃣ Sample Orders (first 10 rows for campaign 23291867037):');
    console.log('─'.repeat(80));

    const sampleOrders = await executeMariaDBQuery<{
      id: number;
      subscription_id: number;
      source: string;
      campaign_id: string;
      created_at: Date;
      validated_at: Date | null;
    }>(
      `SELECT
        id,
        subscription_id,
        source,
        campaign_id,
        created_at,
        validated_at
      FROM vl_crm_orders
      WHERE DATE(created_at) = '2026-01-28'
        AND campaign_id = ?
        AND LOWER(source) = 'adwords'
      ORDER BY id
      LIMIT 10`,
      ['23291867037']
    );

    console.table(sampleOrders);

    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(80));

    const adwordsTotal = balanseraOrders.find(o => o.source.toLowerCase() === 'adwords');
    const drcashTotal = balanseraOrders.find(o => o.source.toLowerCase() === 'drcash');
    const facebookTotal = balanseraOrders.find(o => o.source.toLowerCase() === 'facebook');

    console.log(`Campaign: Balansera_Dnk_IM_24_11 (campaign_id: 23291867037)`);
    console.log(`Date: January 28, 2026`);
    console.log('');
    console.log(`✓ Adwords:  ${adwordsTotal?.order_count || 0} orders (should count for Google Ads)`);
    console.log(`✗ DrCash:   ${drcashTotal?.order_count || 0} orders (should NOT count for Google Ads)`);
    console.log(`✗ Facebook: ${facebookTotal?.order_count || 0} orders (should NOT count for Google Ads)`);
    console.log('');
    console.log(`Expected in Marketing Report: ${adwordsTotal?.order_count || 0} CRM subs`);
    console.log('═'.repeat(80));

  } catch (error) {
    console.error('❌ Error querying MariaDB:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
