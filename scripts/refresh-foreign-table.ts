/**
 * Refresh foreign table to pick up new columns from session_tracker
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  process.stderr.write('❌ DATABASE_URL environment variable is required\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function refreshForeignTable() {
  try {
    process.stdout.write('🔄 Refreshing foreign table definition...\n\n');

    // Step 1: Check current foreign server
    process.stdout.write('📋 Step 1: Checking foreign server configuration...\n');
    const serverCheck = await pool.query(`
      SELECT srvname, srvoptions
      FROM pg_foreign_server
      WHERE srvname LIKE '%session%tracker%'
    `);

    if (serverCheck.rows.length === 0) {
      process.stderr.write('❌ No foreign server found matching "session_tracker"\n');
      process.stderr.write('   Please provide the foreign server name or setup details.\n');
      await pool.end();
      process.exit(1);
    }

    const serverName = serverCheck.rows[0].srvname;
    process.stdout.write(`   ✅ Found foreign server: ${serverName}\n\n`);

    // Step 2: Drop and reimport foreign table
    process.stdout.write('📋 Step 2: Dropping old foreign table...\n');
    await pool.query(`
      DROP FOREIGN TABLE IF EXISTS remote_session_tracker.event_page_view_enriched CASCADE
    `);
    process.stdout.write('   ✅ Dropped\n\n');

    process.stdout.write('📋 Step 3: Importing fresh schema from source...\n');
    // Note: IMPORT FOREIGN SCHEMA doesn't support parameterized server names
    // serverName comes from pg_catalog, not user input, so it's safe
    const importSQL = `
      IMPORT FOREIGN SCHEMA public
      LIMIT TO (event_page_view_enriched)
      FROM SERVER ${serverName}
      INTO remote_session_tracker
    `;
    await pool.query(importSQL);
    process.stdout.write('   ✅ Imported\n\n');

    // Step 3: Verify new columns
    process.stdout.write('📋 Step 4: Verifying new columns...\n');
    const columnsCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'remote_session_tracker'
        AND table_name = 'event_page_view_enriched'
        AND column_name IN (
          'keyword', 'placement', 'user_agent', 'language',
          'platform', 'referrer', 'os_version', 'cta_viewed', 'cta_clicked'
        )
      ORDER BY column_name
    `);

    if (columnsCheck.rows.length === 9) {
      process.stdout.write('   ✅ All 9 new columns present:\n');
      columnsCheck.rows.forEach(r => {
        process.stdout.write(`      - ${r.column_name}\n`);
      });
    } else {
      process.stdout.write(`   ⚠️  Only ${columnsCheck.rows.length}/9 new columns found:\n`);
      columnsCheck.rows.forEach(r => {
        process.stdout.write(`      - ${r.column_name}\n`);
      });
      process.stderr.write('\n❌ Some columns are missing. Check if the source view was updated correctly.\n');
      await pool.end();
      process.exit(1);
    }

    process.stdout.write('\n✅ Foreign table refreshed successfully!\n');
    process.stdout.write('\n📝 Next step:\n');
    process.stdout.write('   Run: npx tsx scripts/apply-enriched-fields-migration.ts\n\n');

    await pool.end();

  } catch (error) {
    process.stderr.write('\n❌ Refresh failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

refreshForeignTable();
