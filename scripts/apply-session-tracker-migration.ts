/**
 * Apply migration to session_tracker database
 * Adds 9 new fields to event_page_view_enriched view
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment
config({ path: '.env.local' });

// Use SESSION_TRACKER_DATABASE_URL or fall back to DATABASE_URL
const dbUrl = process.env.SESSION_TRACKER_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  process.stderr.write('❌ SESSION_TRACKER_DATABASE_URL or DATABASE_URL environment variable is required\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function applyMigration() {
  try {
    process.stdout.write('🚀 Starting migration: session_tracker - Add 9 new fields to event_page_view_enriched\n\n');

    // Step 1: Read and execute migration SQL
    process.stdout.write('📋 Step 1: Applying migration SQL to session_tracker database...\n');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations/session-tracker-add-fields.sql'),
      'utf8'
    );

    // Extract only the forward migration part
    const forwardSQL = migrationSQL.split('-- ROLLBACK INSTRUCTIONS')[0];

    await pool.query(forwardSQL);
    process.stdout.write('   ✅ View updated successfully\n\n');

    // Step 2: Verify new fields
    process.stdout.write('📋 Step 2: Verifying new fields in event_page_view_enriched...\n');

    const columnsQuery = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'event_page_view_enriched'
        AND column_name IN (
          'session_id', 'keyword', 'placement', 'user_agent',
          'language', 'platform', 'referrer', 'os_version',
          'cta_viewed', 'cta_clicked'
        )
      ORDER BY column_name
    `;

    const columns = await pool.query(columnsQuery);
    process.stdout.write(`   ✅ Found ${columns.rows.length}/10 target fields:\n`);
    columns.rows.forEach(col => {
      process.stdout.write(`      ${col.column_name.padEnd(20)} (${col.data_type})\n`);
    });

    // Step 3: Sample data
    process.stdout.write('\n📋 Step 3: Sample data from new fields...\n');
    const sampleQuery = `
      SELECT
        session_id,
        keyword,
        placement,
        LEFT(user_agent, 50) as user_agent_preview,
        language,
        platform,
        LEFT(referrer, 40) as referrer_preview,
        os_version,
        cta_viewed,
        cta_clicked
      FROM public.event_page_view_enriched
      WHERE user_agent IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 2
    `;

    const sample = await pool.query(sampleQuery);
    sample.rows.forEach((row, i) => {
      process.stdout.write(`\n   Sample ${i + 1}:\n`);
      process.stdout.write(`      session_id: ${row.session_id || '(null)'}\n`);
      process.stdout.write(`      keyword: ${row.keyword || '(null)'}\n`);
      process.stdout.write(`      placement: ${row.placement || '(null)'}\n`);
      process.stdout.write(`      user_agent: ${row.user_agent_preview || '(null)'}...\n`);
      process.stdout.write(`      language: ${row.language || '(null)'}\n`);
      process.stdout.write(`      platform: ${row.platform || '(null)'}\n`);
      process.stdout.write(`      referrer: ${row.referrer_preview || '(null)'}...\n`);
      process.stdout.write(`      os_version: ${row.os_version || '(null)'}\n`);
      process.stdout.write(`      cta_viewed: ${row.cta_viewed}\n`);
      process.stdout.write(`      cta_clicked: ${row.cta_clicked}\n`);
    });

    process.stdout.write('\n✅ Session tracker migration completed successfully!\n');
    process.stdout.write('\n📝 Next step:\n');
    process.stdout.write('   Run: npx tsx scripts/apply-enriched-fields-migration.ts\n');
    process.stdout.write('   This will update the materialized view in the main database.\n\n');

    await pool.end();

  } catch (error) {
    process.stderr.write('\n❌ Migration failed: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    process.stderr.write('\n⚠️  Check the error and verify database connection.\n');
    await pool.end();
    process.exit(1);
  }
}

applyMigration();
