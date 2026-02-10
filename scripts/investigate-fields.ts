/**
 * Investigation: Check what fields are available in base tables
 */
import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function investigate() {
  try {
    // Check base event_page_view columns
    console.log('=== BASE TABLE: event_page_view ===\n');
    const baseColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'remote_session_tracker'
        AND table_name = 'event_page_view'
      ORDER BY ordinal_position
    `);
    console.log('Available columns:');
    baseColumns.rows.forEach(r => {
      console.log(`  ${r.column_name} (${r.data_type})${r.is_nullable === 'YES' ? ' NULL' : ''}`);
    });

    // Sample data to see actual values
    console.log('\n=== SAMPLE DATA FROM BASE TABLE ===\n');
    const sample = await pool.query(`
      SELECT 
        session_id,
        client_info->>'referrer' as referrer,
        client_info->>'user_agent' as user_agent,
        client_info->>'language' as language,
        client_info->>'platform' as platform,
        client_info->>'title' as page_title,
        (client_info->>'screen_width')::int as screen_width,
        (client_info->>'screen_height')::int as screen_height,
        (client_info->>'viewport_width')::int as viewport_width,
        (client_info->>'viewport_height')::int as viewport_height,
        (client_info->>'device_pixel_ratio')::numeric as device_pixel_ratio,
        client_info->'os'->>'version' as os_version,
        url_path
      FROM remote_session_tracker.event_page_view
      WHERE client_info IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    console.log('Sample records:');
    sample.rows.forEach((r, i) => {
      console.log(`\nRecord ${i + 1}:`);
      console.log(`  session_id: ${r.session_id}`);
      console.log(`  referrer: ${r.referrer || '(null)'}`);
      console.log(`  user_agent: ${r.user_agent?.substring(0, 60) || '(null)'}...`);
      console.log(`  language: ${r.language || '(null)'}`);
      console.log(`  platform: ${r.platform || '(null)'}`);
      console.log(`  page_title: ${r.page_title || '(null)'}`);
      console.log(`  screen: ${r.screen_width}x${r.screen_height}`);
      console.log(`  viewport: ${r.viewport_width}x${r.viewport_height}`);
      console.log(`  dpr: ${r.device_pixel_ratio}`);
      console.log(`  os_version: ${r.os_version || '(null)'}`);
    });

    // Check keyword/placement in URLs
    console.log('\n=== UTM KEYWORD/PLACEMENT CHECK ===\n');
    const utmCheck = await pool.query(`
      SELECT url_path
      FROM remote_session_tracker.event_page_view
      WHERE url_path ILIKE '%keyword=%' OR url_path ILIKE '%placement=%'
      LIMIT 5
    `);
    console.log(`Found ${utmCheck.rows.length} URLs with keyword/placement parameters`);
    utmCheck.rows.forEach(r => console.log(`  ${r.url_path}`));

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

investigate();
