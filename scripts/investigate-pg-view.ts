/**
 * Investigation script to determine if event_page_view_enriched_v2 is a view/materialized view
 * and retrieve its definition
 */

import { Pool } from '@neondatabase/serverless';

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function investigate() {
  try {
    console.log('🔍 Investigating remote_session_tracker.event_page_view_enriched_v2...\n');

    // Check if it's a regular table
    const tableCheck = await pool.query(`
      SELECT
        schemaname,
        tablename,
        tableowner
      FROM pg_tables
      WHERE schemaname = 'remote_session_tracker'
        AND tablename = 'event_page_view_enriched_v2'
    `);

    if (tableCheck.rows.length > 0) {
      console.log('📊 Type: REGULAR TABLE');
      console.log('   Owner:', tableCheck.rows[0].tableowner);
      console.log('\n⚠️  This is a regular table, not a view.');
      console.log('   To normalize url_path, you would need to:');
      console.log('   1. Add a computed/generated column, OR');
      console.log('   2. Create a view on top of this table, OR');
      console.log('   3. Keep the current SPLIT_PART approach in queries\n');
      await pool.end();
      return;
    }

    // Check if it's a regular view
    const viewCheck = await pool.query(`
      SELECT
        schemaname,
        viewname,
        viewowner,
        definition
      FROM pg_views
      WHERE schemaname = 'remote_session_tracker'
        AND viewname = 'event_page_view_enriched_v2'
    `);

    if (viewCheck.rows.length > 0) {
      console.log('📋 Type: VIEW (regular)');
      console.log('   Owner:', viewCheck.rows[0].viewowner);
      console.log('\n📝 Current Definition:');
      console.log('─'.repeat(80));
      console.log(viewCheck.rows[0].definition);
      console.log('─'.repeat(80));
      console.log('\n✅ This is a regular view - can be modified with CREATE OR REPLACE VIEW');
      console.log('   URL normalization can be added to the SELECT statement.\n');
      await pool.end();
      return;
    }

    // Check if it's a materialized view
    const matViewCheck = await pool.query(`
      SELECT
        schemaname,
        matviewname,
        matviewowner,
        definition,
        ispopulated
      FROM pg_matviews
      WHERE schemaname = 'remote_session_tracker'
        AND matviewname = 'event_page_view_enriched_v2'
    `);

    if (matViewCheck.rows.length > 0) {
      console.log('💾 Type: MATERIALIZED VIEW');
      console.log('   Owner:', matViewCheck.rows[0].matviewowner);
      console.log('   Populated:', matViewCheck.rows[0].ispopulated);
      console.log('\n📝 Current Definition:');
      console.log('─'.repeat(80));
      console.log(matViewCheck.rows[0].definition);
      console.log('─'.repeat(80));
      console.log('\n✅ This is a materialized view.');
      console.log('   To modify:');
      console.log('   1. DROP MATERIALIZED VIEW event_page_view_enriched_v2;');
      console.log('   2. CREATE MATERIALIZED VIEW with normalized url_path');
      console.log('   3. REFRESH MATERIALIZED VIEW event_page_view_enriched_v2;');
      console.log('\n⚠️  Note: Check refresh frequency and data volume before modifying.\n');
      await pool.end();
      return;
    }

    // Not found
    console.log('❌ Object not found in remote_session_tracker schema.');
    console.log('   It might be in a different schema or not exist.\n');

    // Check all schemas
    console.log('🔎 Searching all schemas...');
    const allSearch = await pool.query(`
      SELECT 'table' as type, schemaname, tablename as name
      FROM pg_tables
      WHERE tablename = 'event_page_view_enriched_v2'
      UNION ALL
      SELECT 'view' as type, schemaname, viewname as name
      FROM pg_views
      WHERE viewname = 'event_page_view_enriched_v2'
      UNION ALL
      SELECT 'matview' as type, schemaname, matviewname as name
      FROM pg_matviews
      WHERE matviewname = 'event_page_view_enriched_v2'
    `);

    if (allSearch.rows.length > 0) {
      console.log('\n📍 Found in different schema:');
      allSearch.rows.forEach(row => {
        console.log(`   ${row.type.toUpperCase()}: ${row.schemaname}.${row.name}`);
      });
    } else {
      console.log('   Not found in any schema.\n');
    }

    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

investigate();
