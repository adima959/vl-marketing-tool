/**
 * Verification script for CRM attribution fix
 * Tests the merged_ads_spending view to ensure proper network attribution
 */

import { executeQuery } from '../lib/server/db';

interface NetworkStats {
  network: string;
  row_count: number;
  total_cost: number;
  total_clicks: number;
  total_crm_subscriptions: number;
  total_approved_sales: number;
  crm_per_100_clicks: number;
}

interface SourceMapping {
  source: string;
  order_count: number;
  mapping_status: string;
}

interface SampleRow {
  network: string;
  date: Date;
  campaign_name: string;
  cost: number;
  clicks: number;
  crm_subscriptions: number;
  approved_sales: number;
  crm_rate_percent: number;
}

async function main() {
  console.log('🔍 Verifying CRM Attribution Fix...\n');

  try {
    // Test 1: Check view type
    console.log('1️⃣ Checking view type...');
    const viewTypeQuery = `
      SELECT
        CASE
          WHEN EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'merged_ads_spending') THEN 'VIEW'
          WHEN EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'merged_ads_spending') THEN 'MATERIALIZED VIEW'
          ELSE 'NOT FOUND'
        END as view_type
    `;
    const [viewType] = await executeQuery<{ view_type: string }>(viewTypeQuery);
    console.log(`   View Type: ${viewType.view_type}`);

    if (viewType.view_type === 'MATERIALIZED VIEW') {
      console.log('   ⚠️  Note: Run REFRESH MATERIALIZED VIEW merged_ads_spending to update data\n');
    } else {
      console.log('   ✓ Regular view - no refresh needed\n');
    }

    // Test 2: Network-level CRM attribution (last 30 days)
    console.log('2️⃣ Checking CRM data by network (last 30 days)...');
    const networkStatsQuery = `
      SELECT
        network,
        COUNT(*)::integer as row_count,
        ROUND(SUM(cost), 2) as total_cost,
        SUM(clicks)::integer as total_clicks,
        SUM(crm_subscriptions)::integer as total_crm_subscriptions,
        SUM(approved_sales)::integer as total_approved_sales,
        ROUND(SUM(crm_subscriptions)::numeric / NULLIF(SUM(clicks), 0) * 100, 2) as crm_per_100_clicks
      FROM merged_ads_spending
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY network
      ORDER BY network
    `;
    const networkStats = await executeQuery<NetworkStats>(networkStatsQuery);

    console.table(networkStats);

    // Validate results
    let hasGoogleCrm = false;
    let hasFacebookCrm = false;

    networkStats.forEach(stat => {
      if (stat.network === 'Google Ads' && stat.total_crm_subscriptions > 0) {
        hasGoogleCrm = true;
        console.log(`   ✓ Google Ads: ${stat.total_crm_subscriptions} CRM subscriptions`);
      }
      if (stat.network === 'Facebook' && stat.total_crm_subscriptions > 0) {
        hasFacebookCrm = true;
        console.log(`   ✓ Facebook: ${stat.total_crm_subscriptions} CRM subscriptions`);
      }
    });

    if (hasGoogleCrm && hasFacebookCrm) {
      console.log('\n   ✅ SUCCESS! Both networks show CRM data\n');
    } else {
      console.log('\n   ⚠️  WARNING: Some networks missing CRM data\n');
    }

    // Test 3: Check source mapping in CRM
    console.log('3️⃣ Checking source distribution in vl_crm_orders...');
    const sourceMappingQuery = `
      SELECT
        source,
        COUNT(*)::integer as order_count,
        CASE
          WHEN LOWER(source) = 'adwords' THEN '→ Google Ads'
          WHEN LOWER(source) = 'facebook' THEN '→ Facebook'
          ELSE '⚠ UNMAPPED'
        END as mapping_status
      FROM vl_crm_orders
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND campaign_id IS NOT NULL
      GROUP BY source
      ORDER BY order_count DESC
      LIMIT 10
    `;
    const sourceMappings = await executeQuery<SourceMapping>(sourceMappingQuery);

    console.table(sourceMappings);

    const unmappedSources = sourceMappings.filter(s => s.mapping_status === '⚠ UNMAPPED');
    if (unmappedSources.length > 0) {
      console.log(`\n   ⚠️  Found ${unmappedSources.length} unmapped sources`);
      console.log('   Consider adding these to the network mapping in merged_ads_spending view\n');
    }

    // Test 4: Sample rows with CRM data
    console.log('4️⃣ Sample rows with CRM attribution (last 7 days)...');
    const sampleRowsQuery = `
      SELECT
        network,
        date,
        campaign_name,
        ROUND(cost, 2) as cost,
        clicks::integer as clicks,
        crm_subscriptions::integer as crm_subscriptions,
        approved_sales::integer as approved_sales,
        CASE
          WHEN clicks > 0 THEN ROUND(crm_subscriptions::numeric / clicks * 100, 2)
          ELSE 0
        END as crm_rate_percent
      FROM merged_ads_spending
      WHERE crm_subscriptions > 0
        AND date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY date DESC, network, crm_subscriptions DESC
      LIMIT 5
    `;
    const sampleRows = await executeQuery<SampleRow>(sampleRowsQuery);

    if (sampleRows.length > 0) {
      console.table(sampleRows);
      console.log(`   ✓ Found ${sampleRows.length} recent rows with CRM data\n`);
    } else {
      console.log('   ⚠️  No rows with CRM data in last 7 days\n');
    }

    // Test 5: Check backup view exists
    console.log('5️⃣ Checking backup view...');
    const backupCheckQuery = `
      SELECT EXISTS (
        SELECT 1 FROM pg_views
        WHERE viewname = 'merged_ads_spending_backup_20260129'
      ) as backup_exists
    `;
    const [backupCheck] = await executeQuery<{ backup_exists: boolean }>(backupCheckQuery);

    if (backupCheck.backup_exists) {
      console.log('   ✓ Backup view exists: merged_ads_spending_backup_20260129');
      console.log('   To rollback: DROP VIEW merged_ads_spending; CREATE VIEW merged_ads_spending AS SELECT * FROM merged_ads_spending_backup_20260129;\n');
    } else {
      console.log('   ⚠️  No backup view found\n');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Verification Complete!');
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
