import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    // Get columns from the foreign table
    const result = await pool.query(`
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'remote_session_tracker'
        AND table_name = 'event_page_view_enriched'
      ORDER BY ordinal_position
    `);

    process.stdout.write('=== Columns in event_page_view_enriched (foreign table) ===\n\n');
    result.rows.forEach(r => {
      process.stdout.write(`${r.column_name.padEnd(25)} ${r.data_type.padEnd(20)} ${r.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}\n`);
    });

    // Check if our target fields exist
    const targetFields = [
      'session_id', 'keyword', 'placement', 'user_agent',
      'language', 'platform', 'referrer', 'os_version',
      'cta_viewed', 'cta_clicked'
    ];

    process.stdout.write('\n=== Target fields availability ===\n');
    const availableFields = result.rows.map(r => r.column_name);
    targetFields.forEach(field => {
      const exists = availableFields.includes(field);
      process.stdout.write(`${field.padEnd(20)} ${exists ? '✅ Available' : '❌ Missing'}\n`);
    });

    await pool.end();
  } catch (error) {
    process.stderr.write('Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

check();
