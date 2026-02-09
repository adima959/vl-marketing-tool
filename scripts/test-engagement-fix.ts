import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function testEngagementFix() {
  try {
    console.log('🧪 Testing engagement metrics fix...\n');

    // First, refresh the materialized view to get latest data
    console.log('1️⃣ Refreshing materialized view...');
    await pool.query('REFRESH MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2');
    console.log('   ✅ Refreshed\n');

    // Check overall statistics
    console.log('2️⃣ Overall statistics:');
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(CASE WHEN active_time_s > 0 THEN 1 END) as active_time_nonzero,
        COUNT(CASE WHEN scroll_percent > 0 THEN 1 END) as scroll_nonzero,
        ROUND(AVG(active_time_s)::numeric, 2) as avg_active_time,
        ROUND(AVG(scroll_percent)::numeric, 2) as avg_scroll_percent,
        MAX(active_time_s) as max_active_time,
        MAX(scroll_percent) as max_scroll_percent
      FROM remote_session_tracker.event_page_view_enriched_v2
    `);

    const s = stats.rows[0];
    console.log(`   Total rows: ${s.total_rows}`);
    console.log(`   Active time > 0: ${s.active_time_nonzero} (${((s.active_time_nonzero / s.total_rows) * 100).toFixed(1)}%)`);
    console.log(`   Scroll % > 0: ${s.scroll_nonzero} (${((s.scroll_nonzero / s.total_rows) * 100).toFixed(1)}%)`);
    console.log(`   Avg active time: ${s.avg_active_time}s`);
    console.log(`   Avg scroll %: ${s.avg_scroll_percent}%`);
    console.log(`   Max active time: ${s.max_active_time}s`);
    console.log(`   Max scroll %: ${s.max_scroll_percent}%`);
    console.log();

    // Show sample records with engagement data
    console.log('3️⃣ Sample records with engagement data:');
    const samples = await pool.query(`
      SELECT
        id,
        created_at::date as date,
        url_path,
        active_time_s,
        scroll_percent,
        visit_number
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE active_time_s > 0 OR scroll_percent > 0
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (samples.rows.length === 0) {
      console.log('   ❌ No records with engagement data found!');
    } else {
      console.log(`   Found ${samples.rows.length} recent records with engagement:\n`);
      samples.rows.forEach((r, i) => {
        const urlShort = r.url_path.length > 50 ? r.url_path.substring(0, 50) + '...' : r.url_path;
        console.log(`   ${i + 1}. ${r.date} | Active: ${r.active_time_s}s | Scroll: ${r.scroll_percent || 0}% | Visit: ${r.visit_number}`);
        console.log(`      ${urlShort}`);
      });
    }
    console.log();

    // Check distribution of engagement metrics
    console.log('4️⃣ Engagement distribution:');
    const distribution = await pool.query(`
      SELECT
        time_bucket,
        COUNT(*) as count,
        ROUND(AVG(scroll_percent)::numeric, 1) as avg_scroll
      FROM (
        SELECT
          CASE
            WHEN active_time_s = 0 THEN '0s (no engagement)'
            WHEN active_time_s <= 5 THEN '1-5s (quick view)'
            WHEN active_time_s <= 30 THEN '6-30s (browsing)'
            WHEN active_time_s <= 120 THEN '31-120s (engaged)'
            ELSE '>120s (very engaged)'
          END as time_bucket,
          CASE
            WHEN active_time_s = 0 THEN 0
            WHEN active_time_s <= 5 THEN 1
            WHEN active_time_s <= 30 THEN 2
            WHEN active_time_s <= 120 THEN 3
            ELSE 4
          END as sort_order,
          scroll_percent
        FROM remote_session_tracker.event_page_view_enriched_v2
      ) sub
      GROUP BY time_bucket, sort_order
      ORDER BY sort_order
    `);

    console.log('   Active time distribution:');
    distribution.rows.forEach(r => {
      console.log(`      ${r.time_bucket.padEnd(25)} ${r.count.toString().padStart(6)} rows (avg scroll: ${r.avg_scroll || 0}%)`);
    });
    console.log();

    // Check scroll distribution
    const scrollDist = await pool.query(`
      SELECT
        scroll_bucket,
        COUNT(*) as count
      FROM (
        SELECT
          CASE
            WHEN scroll_percent IS NULL OR scroll_percent = 0 THEN 'No scroll'
            WHEN scroll_percent <= 25 THEN '1-25% (top only)'
            WHEN scroll_percent <= 50 THEN '26-50% (half page)'
            WHEN scroll_percent <= 75 THEN '51-75% (most page)'
            ELSE '76-100% (full page)'
          END as scroll_bucket,
          CASE
            WHEN scroll_percent IS NULL OR scroll_percent = 0 THEN 0
            WHEN scroll_percent <= 25 THEN 1
            WHEN scroll_percent <= 50 THEN 2
            WHEN scroll_percent <= 75 THEN 3
            ELSE 4
          END as sort_order
        FROM remote_session_tracker.event_page_view_enriched_v2
      ) sub
      GROUP BY scroll_bucket, sort_order
      ORDER BY sort_order
    `);

    console.log('   Scroll depth distribution:');
    scrollDist.rows.forEach(r => {
      console.log(`      ${r.scroll_bucket.padEnd(25)} ${r.count.toString().padStart(6)} rows`);
    });
    console.log();

    // Validation checks
    console.log('5️⃣ Validation checks:');
    const nonZeroActive = parseInt(s.active_time_nonzero);
    const nonZeroScroll = parseInt(s.scroll_nonzero);

    if (nonZeroActive === 0 && nonZeroScroll === 0) {
      console.log('   ❌ FAILED: Both metrics are still all zeros!');
      console.log('      The view may not have been updated correctly.');
    } else if (nonZeroActive > 0 && nonZeroScroll > 0) {
      console.log('   ✅ SUCCESS: Both metrics have real data!');
      console.log(`      Active time: ${((nonZeroActive / s.total_rows) * 100).toFixed(1)}% of records`);
      console.log(`      Scroll data: ${((nonZeroScroll / s.total_rows) * 100).toFixed(1)}% of records`);
    } else {
      console.log('   ⚠️  PARTIAL: Only one metric has data');
      if (nonZeroActive === 0) console.log('      ❌ Active time still all zeros');
      if (nonZeroScroll === 0) console.log('      ❌ Scroll percent still all zeros');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack);
    }
    await pool.end();
    process.exit(1);
  }
}

testEngagementFix();
