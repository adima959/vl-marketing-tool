import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function refreshView() {
  try {
    console.log('🔄 Checking if materialized view needs refresh...\n');

    // First check if foreign table has the columns
    const foreignCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'remote_session_tracker'
        AND table_name = 'event_page_view_enriched'
        AND column_name IN ('keyword', 'placement')
      ORDER BY column_name
    `);

    console.log('✅ Foreign table columns:');
    if (foreignCheck.rows.length === 0) {
      console.log('   ❌ No keyword/placement columns found in foreign table!');
      console.log('   Run: npx tsx scripts/refresh-foreign-table.ts first');
      await pool.end();
      process.exit(1);
    }
    foreignCheck.rows.forEach(r => {
      console.log(`   - ${r.column_name}`);
    });
    console.log();

    // Sample from foreign table to see if it has data
    console.log('📊 Sampling from foreign table...');
    const foreignSample = await pool.query(`
      SELECT keyword, placement
      FROM remote_session_tracker.event_page_view_enriched
      WHERE keyword IS NOT NULL OR placement IS NOT NULL
      LIMIT 3
    `);
    console.log(`   Found ${foreignSample.rows.length} rows with keyword/placement\n`);

    // Now refresh the materialized view
    console.log('🔄 Refreshing materialized view...');
    const startTime = Date.now();
    await pool.query(`
      REFRESH MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2
    `);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`   ✅ Refreshed in ${duration}s\n`);

    // Verify the refresh worked
    const verifyCount = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(keyword) as keyword_count,
        COUNT(placement) as placement_count,
        COUNT(CASE WHEN keyword IS NOT NULL AND keyword != '' THEN 1 END) as keyword_non_empty,
        COUNT(CASE WHEN placement IS NOT NULL AND placement != '' THEN 1 END) as placement_non_empty
      FROM remote_session_tracker.event_page_view_enriched_v2
    `);

    console.log('✅ Verification:');
    console.log(`   Total rows: ${verifyCount.rows[0].total}`);
    console.log(`   Keyword non-NULL: ${verifyCount.rows[0].keyword_count}`);
    console.log(`   Keyword non-empty: ${verifyCount.rows[0].keyword_non_empty}`);
    console.log(`   Placement non-NULL: ${verifyCount.rows[0].placement_count}`);
    console.log(`   Placement non-empty: ${verifyCount.rows[0].placement_non_empty}`);
    console.log();

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    await pool.end();
    process.exit(1);
  }
}

refreshView();
