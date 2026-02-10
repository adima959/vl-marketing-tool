/**
 * Apply the URL normalization migration to the materialized view
 */

import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function applyMigration() {
  try {
    console.log('🚀 Starting migration: Normalize url_path in materialized view\n');

    // Step 1: Drop existing materialized view
    console.log('📋 Step 1: Dropping existing materialized view...');
    await pool.query('DROP MATERIALIZED VIEW IF EXISTS remote_session_tracker.event_page_view_enriched_v2');
    console.log('   ✅ Dropped successfully\n');

    // Step 2: Create with normalized url_path
    console.log('📋 Step 2: Creating materialized view with normalized url_path...');
    const createViewSQL = `
      CREATE MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2 AS
      SELECT
          id,
          created_at,
          ff_visitor_id,
          ff_funnel_id,
          -- NORMALIZED: Strip everything after ? and # from url_path
          SPLIT_PART(SPLIT_PART(url_path, '?', 1), '#', 1) AS url_path,
          url_full,
          page_type,
          utm_source,
          utm_campaign,
          utm_content,
          utm_medium,
          utm_term,
          device_type,
          os_name,
          browser_name,
          country_code,
          timezone,
          local_hour_of_day,
          visit_number,
          active_time_s,
          scroll_percent,
          fcp_s,
          lcp_s,
          tti_s,
          form_view,
          form_started,
          form_errors,
          hero_scroll_passed,
          page_elements
      FROM remote_session_tracker.event_page_view_enriched
    `;
    await pool.query(createViewSQL);
    console.log('   ✅ Created successfully\n');

    // Step 3: Refresh the materialized view
    console.log('📋 Step 3: Refreshing materialized view (this may take a moment)...');
    const refreshStart = Date.now();
    await pool.query('REFRESH MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2');
    const refreshTime = ((Date.now() - refreshStart) / 1000).toFixed(2);
    console.log(`   ✅ Refreshed successfully (${refreshTime}s)\n`);

    // Step 4: Verify
    console.log('📋 Step 4: Verifying...');

    // Check row count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total_rows
      FROM remote_session_tracker.event_page_view_enriched_v2
    `);
    const totalRows = Number(countResult.rows[0].total_rows);
    console.log(`   ✅ Total rows: ${totalRows.toLocaleString()}`);

    // Check for normalized URLs
    const normalizedCheck = await pool.query(`
      SELECT
        url_full,
        url_path as normalized_path,
        COUNT(*) as occurrences
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE url_full LIKE '%#%' OR url_full LIKE '%?%'
      GROUP BY url_full, url_path
      ORDER BY occurrences DESC
      LIMIT 5
    `);

    if (normalizedCheck.rows.length > 0) {
      console.log('\n   📊 Sample normalized URLs:');
      normalizedCheck.rows.forEach(row => {
        console.log(`      ${row.url_full}`);
        console.log(`      → ${row.normalized_path} (${row.occurrences} occurrences)`);
      });
    } else {
      console.log('   ℹ️  No URLs with # or ? found in this dataset');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Update application code to remove SPLIT_PART calls');
    console.log('   2. Test on-page analytics to verify data loads correctly\n');

    await pool.end();

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\n⚠️  Rollback may be needed. Check the SQL file for rollback instructions.');
    await pool.end();
    process.exit(1);
  }
}

applyMigration();
