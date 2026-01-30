/**
 * Update merged_ads_spending MATERIALIZED VIEW to remove CRM columns
 *
 * This script:
 * 1. Backs up the current materialized view
 * 2. Drops and recreates the view WITHOUT crm_subscriptions and approved_sales columns
 * 3. Refreshes the materialized view with fresh data
 * 4. Verifies the new view works
 *
 * Why: The two-database architecture separates ads data (PostgreSQL) from CRM data (MariaDB).
 * The view should only contain ads data. CRM metrics are calculated in marketingQueryBuilder.ts
 * by joining with MariaDB data at query time.
 */

import { executeQuery } from '../lib/server/db';

async function updateMaterializedView() {
  try {
    console.log('🔧 Updating merged_ads_spending MATERIALIZED VIEW to remove CRM columns...\n');

    // Step 1: Check if backup already exists
    console.log('1️⃣ Checking for existing backup...');
    const backupExists = await executeQuery<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE matviewname = 'merged_ads_spending_backup_pre_crm_removal'
      ) as exists
    `);

    if (backupExists[0].exists) {
      console.log('   ⚠️  Backup already exists: merged_ads_spending_backup_pre_crm_removal');
      console.log('   To re-run: DROP MATERIALIZED VIEW merged_ads_spending_backup_pre_crm_removal;\n');

      const proceed = process.argv.includes('--force');
      if (!proceed) {
        console.log('   Use --force flag to proceed anyway (will skip backup step)\n');
        process.exit(1);
      }
      console.log('   --force flag detected, proceeding without new backup\n');
    } else {
      // Step 2: Create backup
      console.log('2️⃣ Creating backup of current materialized view...');
      await executeQuery(`
        CREATE MATERIALIZED VIEW merged_ads_spending_backup_pre_crm_removal AS
        SELECT * FROM merged_ads_spending
      `);
      console.log('   ✅ Backup created: merged_ads_spending_backup_pre_crm_removal\n');
    }

    // Step 3: Analyze current structure
    console.log('3️⃣ Analyzing current structure...');
    const sample = await executeQuery(`
      SELECT * FROM merged_ads_spending LIMIT 1
    `);

    if (sample.length > 0) {
      const columns = Object.keys(sample[0]);
      console.log(`   Current columns (${columns.length}):`);
      console.log(`   ${columns.join(', ')}\n`);
    }

    // Step 4: Drop current materialized view
    console.log('4️⃣ Dropping current materialized view...');
    await executeQuery('DROP MATERIALIZED VIEW IF EXISTS merged_ads_spending CASCADE');
    console.log('   ✅ Materialized view dropped\n');

    // Step 5: Recreate WITHOUT CRM columns
    console.log('5️⃣ Creating new materialized view WITHOUT CRM columns...');
    console.log('   Using source: merged_google_facebook_ads_view\n');

    await executeQuery(`
      CREATE MATERIALIZED VIEW merged_ads_spending AS
      SELECT
        network,
        date,
        campaign_id,
        campaign_name,
        adset_id,
        adset_name,
        ad_id,
        ad_name,
        cost,
        currency,
        clicks,
        impressions,
        ctr_percent,
        cpc,
        cpm,
        conversions
      FROM merged_google_facebook_ads_view
      WHERE date IS NOT NULL
        AND campaign_id IS NOT NULL
        AND adset_id IS NOT NULL
        AND ad_id IS NOT NULL
    `);

    console.log('   ✅ Materialized view created (data not yet loaded)\n');

    // Step 6: Refresh to populate with data
    console.log('6️⃣ Refreshing materialized view (this may take a while)...');
    const startTime = Date.now();
    await executeQuery('REFRESH MATERIALIZED VIEW merged_ads_spending');
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`   ✅ Refresh complete in ${duration}s\n`);

    // Step 7: Verify new structure
    console.log('7️⃣ Verifying new structure...');
    const newSample = await executeQuery(`
      SELECT * FROM merged_ads_spending LIMIT 1
    `);

    if (newSample.length > 0) {
      const newColumns = Object.keys(newSample[0]);
      console.log(`   New columns (${newColumns.length}):`);
      console.log(`   ${newColumns.join(', ')}\n`);

      const hasCrmColumns = newColumns.some(col =>
        col.includes('crm_subscriptions') ||
        col.includes('approved_sales') ||
        col.includes('approval_rate') ||
        col.includes('real_cpa')
      );

      if (hasCrmColumns) {
        console.log('   ❌ ERROR: View still contains CRM columns!\n');
        process.exit(1);
      }

      console.log('   ✅ SUCCESS: No CRM columns found\n');
    }

    // Step 8: Count rows
    const count = await executeQuery<{ count: number }>(`
      SELECT COUNT(*) as count FROM merged_ads_spending
    `);
    console.log(`   📊 Total rows: ${count[0].count.toLocaleString()}\n`);

    // Step 9: Create indexes for performance
    console.log('8️⃣ Creating indexes...');
    await executeQuery(`
      CREATE INDEX idx_merged_ads_campaign
      ON merged_ads_spending(campaign_id, adset_id, ad_id, date)
    `);
    await executeQuery(`
      CREATE INDEX idx_merged_ads_date
      ON merged_ads_spending(date DESC)
    `);
    console.log('   ✅ Indexes created\n');

    console.log('✅ Materialized view update complete!\n');
    console.log('📝 Summary:');
    console.log('   - Old view backed up: merged_ads_spending_backup_pre_crm_removal');
    console.log('   - New view contains ONLY ads data (16 columns)');
    console.log('   - CRM metrics now come ONLY from MariaDB');
    console.log('   - Indexes created for performance');
    console.log('\n💡 To rollback:');
    console.log('   DROP MATERIALIZED VIEW merged_ads_spending;');
    console.log('   ALTER MATERIALIZED VIEW merged_ads_spending_backup_pre_crm_removal');
    console.log('   RENAME TO merged_ads_spending;\n');

  } catch (error) {
    console.error('❌ Error updating materialized view:', error);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check if merged_google_facebook_ads_view exists');
    console.error('   2. Restore from backup: merged_ads_spending_backup_pre_crm_removal');
    console.error('   3. Verify database permissions for CREATE/DROP MATERIALIZED VIEW\n');
    process.exit(1);
  }
}

updateMaterializedView()
  .then(() => {
    console.log('✅ Script complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
