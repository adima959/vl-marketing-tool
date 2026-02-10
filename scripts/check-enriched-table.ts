import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const result = await pool.query(`
      SELECT schemaname, tablename, tableowner
      FROM pg_tables
      WHERE schemaname = 'remote_session_tracker'
        AND tablename = 'event_page_view_enriched'
    `);

    if (result.rows.length > 0) {
      process.stdout.write('✅ event_page_view_enriched is a TABLE\n');
      process.stdout.write(`   Owner: ${result.rows[0].tableowner}\n`);
      
      // Get column count
      const colCount = await pool.query(`
        SELECT COUNT(*) as col_count
        FROM information_schema.columns
        WHERE table_schema = 'remote_session_tracker'
          AND table_name = 'event_page_view_enriched'
      `);
      process.stdout.write(`   Columns: ${colCount.rows[0].col_count}\n`);
      
      // Get row count
      const rowCount = await pool.query(`
        SELECT COUNT(*) as row_count
        FROM remote_session_tracker.event_page_view_enriched
      `);
      process.stdout.write(`   Rows: ${Number(rowCount.rows[0].row_count).toLocaleString()}\n`);
    } else {
      process.stdout.write('❌ event_page_view_enriched is NOT a table\n');
    }

    await pool.end();
  } catch (error) {
    process.stderr.write('Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

check();
