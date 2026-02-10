import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkColumns() {
  try {
    console.log('🔍 Checking keyword and placement columns...\n');

    // Check if columns exist
    const colCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'remote_session_tracker'
        AND table_name = 'event_page_view_enriched_v2'
        AND column_name IN ('keyword', 'placement')
      ORDER BY column_name
    `);

    console.log('✅ Columns in event_page_view_enriched_v2:');
    colCheck.rows.forEach(r => {
      console.log(`   - ${r.column_name}: ${r.data_type}`);
    });
    console.log();

    // Count total rows
    const totalCount = await pool.query(`
      SELECT COUNT(*) as total
      FROM remote_session_tracker.event_page_view_enriched_v2
    `);
    console.log(`📊 Total rows: ${totalCount.rows[0].total}\n`);

    // Count non-null keyword values
    const keywordCount = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(keyword) as non_null,
        COUNT(CASE WHEN keyword IS NOT NULL AND keyword != '' THEN 1 END) as non_empty
      FROM remote_session_tracker.event_page_view_enriched_v2
    `);
    console.log('🔑 Keyword column:');
    console.log(`   - Non-NULL: ${keywordCount.rows[0].non_null}`);
    console.log(`   - Non-empty: ${keywordCount.rows[0].non_empty}`);
    console.log();

    // Count non-null placement values
    const placementCount = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(placement) as non_null,
        COUNT(CASE WHEN placement IS NOT NULL AND placement != '' THEN 1 END) as non_empty
      FROM remote_session_tracker.event_page_view_enriched_v2
    `);
    console.log('📍 Placement column:');
    console.log(`   - Non-NULL: ${placementCount.rows[0].non_null}`);
    console.log(`   - Non-empty: ${placementCount.rows[0].non_empty}`);
    console.log();

    // Sample some URLs to see if they have keyword/placement params
    const urlSample = await pool.query(`
      SELECT url_full, keyword, placement
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE url_full IS NOT NULL
      LIMIT 5
    `);
    console.log('🔗 Sample URLs:');
    urlSample.rows.forEach(r => {
      console.log(`   URL: ${r.url_full || '(null)'}`);
      console.log(`   Keyword: ${r.keyword || '(null)'}`);
      console.log(`   Placement: ${r.placement || '(null)'}`);
      console.log();
    });

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    await pool.end();
    process.exit(1);
  }
}

checkColumns();
