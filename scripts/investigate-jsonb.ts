import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function investigate() {
  try {
    const sample = await pool.query(`
      SELECT 
        properties,
        heartbeat_properties,
        page_leave_properties
      FROM remote_session_tracker.event_page_view
      WHERE properties IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 2
    `);
    
    sample.rows.forEach((r, i) => {
      console.log(`\n=== Record ${i + 1} ===`);
      console.log('\nproperties:', JSON.stringify(r.properties, null, 2));
      console.log('\nheartbeat_properties:', JSON.stringify(r.heartbeat_properties, null, 2));
      console.log('\npage_leave_properties:', JSON.stringify(r.page_leave_properties, null, 2));
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

investigate();
