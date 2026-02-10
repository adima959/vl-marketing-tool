import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getDef() {
  try {
    const result = await pool.query(`
      SELECT pg_get_viewdef('remote_session_tracker.event_page_view_enriched_v2'::regclass, true) as definition
    `);
    
    process.stdout.write(result.rows[0].definition);
    await pool.end();
  } catch (error) {
    process.stderr.write('Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    await pool.end();
    process.exit(1);
  }
}

getDef();
