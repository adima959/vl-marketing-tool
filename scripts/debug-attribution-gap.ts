/**
 * Diagnose: Why do ~25% of visitors appear in page views with utm_campaign=X
 * but NOT in session_entries with entry_utm_campaign=X?
 *
 * Hypothesis: Their session ENTRY page has a different campaign, but a later
 * page view in the same session carries utm_campaign=X.
 *
 * Run: npx tsx scripts/debug-attribution-gap.ts
 */
import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const CAMPAIGN_ID = '23291867037'; // Balansera_Dnk_IM_24_11
const DATE = '2026-02-16';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. Find visitors in PV with this campaign but NOT in SE with this campaign
    console.log('=== 1. Visitors in PV (utm_campaign) but not in SE (entry_utm_campaign) ===');
    const { rows: gap } = await pool.query(`
      WITH pv_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
          AND utm_campaign = $2
      ),
      se_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.session_entries
        WHERE session_start >= $1::date AND session_start < ($1::date + interval '1 day')
          AND entry_utm_campaign = $2
      )
      SELECT COUNT(*) AS missing_count
      FROM pv_visitors pv
      WHERE NOT EXISTS (SELECT 1 FROM se_visitors se WHERE se.ff_visitor_id = pv.ff_visitor_id)
    `, [DATE, CAMPAIGN_ID]);
    console.log(`  Missing visitors: ${gap[0].missing_count}`);

    // 2. For those missing visitors, what entry_utm_campaign do their sessions actually have?
    console.log('\n=== 2. What entry_utm_campaign do their sessions have? ===');
    const { rows: entryCampaigns } = await pool.query(`
      WITH pv_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
          AND utm_campaign = $2
      ),
      se_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.session_entries
        WHERE session_start >= $1::date AND session_start < ($1::date + interval '1 day')
          AND entry_utm_campaign = $2
      ),
      missing AS (
        SELECT ff_visitor_id FROM pv_visitors
        WHERE NOT EXISTS (SELECT 1 FROM se_visitors WHERE se_visitors.ff_visitor_id = pv_visitors.ff_visitor_id)
      )
      SELECT
        se.entry_utm_campaign,
        COUNT(DISTINCT m.ff_visitor_id) AS visitor_count
      FROM missing m
      JOIN remote_session_tracker.session_entries se ON se.ff_visitor_id = m.ff_visitor_id
        AND se.session_start >= $1::date AND se.session_start < ($1::date + interval '1 day')
      GROUP BY se.entry_utm_campaign
      ORDER BY visitor_count DESC
      LIMIT 20
    `, [DATE, CAMPAIGN_ID]);
    console.log('  entry_utm_campaign → visitor_count:');
    for (const r of entryCampaigns) {
      console.log(`    ${r.entry_utm_campaign ?? '(NULL)'}: ${r.visitor_count}`);
    }

    // 3. For those missing visitors, what page_seq do their campaign-tagged page views have?
    //    Are they page_seq=1 (entry) or later pages?
    console.log('\n=== 3. Page sequence of campaign-tagged views for missing visitors ===');
    const { rows: pageSeqs } = await pool.query(`
      WITH pv_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
          AND utm_campaign = $2
      ),
      se_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.session_entries
        WHERE session_start >= $1::date AND session_start < ($1::date + interval '1 day')
          AND entry_utm_campaign = $2
      ),
      missing AS (
        SELECT ff_visitor_id FROM pv_visitors
        WHERE NOT EXISTS (SELECT 1 FROM se_visitors WHERE se_visitors.ff_visitor_id = pv_visitors.ff_visitor_id)
      ),
      ordered AS (
        SELECT
          pv.*,
          ROW_NUMBER() OVER (PARTITION BY pv.session_id ORDER BY pv.created_at ASC, pv.id ASC) AS page_seq
        FROM remote_session_tracker.event_page_view_enriched_v2 pv
        JOIN missing m ON m.ff_visitor_id = pv.ff_visitor_id
        WHERE pv.created_at >= $1::date AND pv.created_at < ($1::date + interval '1 day')
          AND pv.utm_campaign = $2
      )
      SELECT
        page_seq,
        COUNT(*) AS view_count,
        COUNT(DISTINCT ff_visitor_id) AS visitor_count
      FROM ordered
      GROUP BY page_seq
      ORDER BY page_seq
      LIMIT 10
    `, [DATE, CAMPAIGN_ID]);
    console.log('  page_seq → views / visitors:');
    for (const r of pageSeqs) {
      console.log(`    seq ${r.page_seq}: ${r.view_count} views, ${r.visitor_count} visitors`);
    }

    // 4. Sample 5 missing visitors: show their session entry vs the campaign page view
    console.log('\n=== 4. Sample 5 missing visitors: entry page vs campaign page view ===');
    const { rows: samples } = await pool.query(`
      WITH pv_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
          AND utm_campaign = $2
      ),
      se_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.session_entries
        WHERE session_start >= $1::date AND session_start < ($1::date + interval '1 day')
          AND entry_utm_campaign = $2
      ),
      missing AS (
        SELECT ff_visitor_id FROM pv_visitors
        WHERE NOT EXISTS (SELECT 1 FROM se_visitors WHERE se_visitors.ff_visitor_id = pv_visitors.ff_visitor_id)
        LIMIT 5
      )
      SELECT
        m.ff_visitor_id,
        se.session_id,
        se.entry_utm_campaign,
        se.entry_utm_source,
        se.entry_url_path,
        se.session_start,
        pv.utm_campaign AS pv_utm_campaign,
        pv.utm_source AS pv_utm_source,
        pv.url_path AS pv_url_path,
        pv.created_at AS pv_created_at,
        ROW_NUMBER() OVER (PARTITION BY pv.session_id ORDER BY pv.created_at ASC, pv.id ASC) AS pv_page_seq
      FROM missing m
      JOIN remote_session_tracker.session_entries se
        ON se.ff_visitor_id = m.ff_visitor_id
        AND se.session_start >= $1::date AND se.session_start < ($1::date + interval '1 day')
      JOIN remote_session_tracker.event_page_view_enriched_v2 pv
        ON pv.session_id = se.session_id
        AND pv.utm_campaign = $2
      ORDER BY m.ff_visitor_id, pv.created_at
    `, [DATE, CAMPAIGN_ID]);

    for (const r of samples) {
      console.log(`\n  Visitor: ${r.ff_visitor_id}`);
      console.log(`    Session: ${r.session_id}`);
      console.log(`    Entry: campaign=${r.entry_utm_campaign ?? 'NULL'} source=${r.entry_utm_source ?? 'NULL'} url=${r.entry_url_path}`);
      console.log(`    PV[seq ${r.pv_page_seq}]: campaign=${r.pv_utm_campaign} source=${r.pv_utm_source ?? 'NULL'} url=${r.pv_url_path} at=${r.pv_created_at}`);
    }

    // 5. Are these visitors also appearing in SE under a DIFFERENT day?
    //    (session started before midnight, PV after midnight)
    console.log('\n=== 5. Cross-day sessions: SE on different day? ===');
    const { rows: crossDay } = await pool.query(`
      WITH pv_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
          AND utm_campaign = $2
      ),
      se_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.session_entries
        WHERE session_start >= $1::date AND session_start < ($1::date + interval '1 day')
          AND entry_utm_campaign = $2
      ),
      missing AS (
        SELECT ff_visitor_id FROM pv_visitors
        WHERE NOT EXISTS (SELECT 1 FROM se_visitors WHERE se_visitors.ff_visitor_id = pv_visitors.ff_visitor_id)
      )
      SELECT
        CASE
          WHEN se.session_start < $1::date THEN 'before'
          WHEN se.session_start >= ($1::date + interval '1 day') THEN 'after'
          ELSE 'same_day'
        END AS day_bucket,
        COUNT(DISTINCT m.ff_visitor_id) AS visitor_count
      FROM missing m
      JOIN remote_session_tracker.session_entries se
        ON se.ff_visitor_id = m.ff_visitor_id
        AND se.entry_utm_campaign = $2
      GROUP BY day_bucket
      ORDER BY day_bucket
    `, [DATE, CAMPAIGN_ID]);
    console.log('  day_bucket → visitor_count:');
    for (const r of crossDay) {
      console.log(`    ${r.day_bucket}: ${r.visitor_count}`);
    }

    // 6. Missing visitors who have NO session_entry at all on this day
    console.log('\n=== 6. Missing visitors with NO session entry at all on this day ===');
    const { rows: noSession } = await pool.query(`
      WITH pv_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
          AND utm_campaign = $2
      ),
      se_visitors AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.session_entries
        WHERE session_start >= $1::date AND session_start < ($1::date + interval '1 day')
          AND entry_utm_campaign = $2
      ),
      missing AS (
        SELECT ff_visitor_id FROM pv_visitors
        WHERE NOT EXISTS (SELECT 1 FROM se_visitors WHERE se_visitors.ff_visitor_id = pv_visitors.ff_visitor_id)
      )
      SELECT
        COUNT(*) AS total_missing,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM remote_session_tracker.session_entries se
          WHERE se.ff_visitor_id = missing.ff_visitor_id
            AND se.session_start >= $1::date AND se.session_start < ($1::date + interval '1 day')
        )) AS has_session_same_day,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM remote_session_tracker.session_entries se
          WHERE se.ff_visitor_id = missing.ff_visitor_id
            AND se.session_start >= $1::date AND se.session_start < ($1::date + interval '1 day')
        )) AS no_session_same_day
      FROM missing
    `, [DATE, CAMPAIGN_ID]);
    console.log(`  Total missing: ${noSession[0].total_missing}`);
    console.log(`  Has session on same day (diff campaign): ${noSession[0].has_session_same_day}`);
    console.log(`  No session entry on this day at all: ${noSession[0].no_session_same_day}`);

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
