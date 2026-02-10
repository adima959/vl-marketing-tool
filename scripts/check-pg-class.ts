import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const result = await pool.query(`
      SELECT
        c.relname as name,
        c.relkind as kind,
        CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized view'
          WHEN 'i' THEN 'index'
          WHEN 'S' THEN 'sequence'
          WHEN 'f' THEN 'foreign table'
          ELSE c.relkind::text
        END as type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'remote_session_tracker'
        AND c.relname LIKE '%enriched%'
      ORDER BY c.relname
    `);

    process.stdout.write('=== Objects with "enriched" in name ===\n');
    result.rows.forEach(r => {
      process.stdout.write(`${r.name} (${r.type})\n`);
    });

    await pool.end();
  } catch (error) {
    process.stderr.write('Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

check();
