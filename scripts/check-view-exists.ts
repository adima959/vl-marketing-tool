import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkView() {
  try {
    console.log('🔍 Checking for event_page_view_enriched_v2...\n');

    // Check all schemas
    const viewCheck = await pool.query(`
      SELECT
        schemaname,
        matviewname,
        definition
      FROM pg_matviews
      WHERE matviewname LIKE '%event_page_view%'
    `);

    console.log(`Found ${viewCheck.rows.length} materialized views:\n`);
    viewCheck.rows.forEach(v => {
      console.log(`   Schema: ${v.schemaname}`);
      console.log(`   Name: ${v.matviewname}`);
      console.log(`   Definition: ${v.definition.substring(0, 100)}...`);
      console.log();
    });

    // Try to query it directly
    console.log('📊 Testing direct query...');
    try {
      const test = await pool.query(`
        SELECT * FROM remote_session_tracker.event_page_view_enriched_v2 LIMIT 1
      `);
      console.log(`   ✅ Query succeeded! Columns: ${Object.keys(test.rows[0] || {}).join(', ')}`);
    } catch (e) {
      console.log(`   ❌ Query failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    await pool.end();
    process.exit(1);
  }
}

checkView();
