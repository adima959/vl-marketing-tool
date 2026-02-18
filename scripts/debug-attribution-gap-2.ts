/**
 * Deeper dig: For the 1,020 missing visitors on Feb 16, find where their
 * sessions actually live in session_entries.
 *
 * Run: npx tsx scripts/debug-attribution-gap-2.ts
 */
import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const CAMPAIGN_ID = '23291867037';
const DATE = '2026-02-16';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. For missing visitors, get their session_ids from page views,
    //    then find those sessions in session_entries
    console.log('=== 1. Where do their sessions live? (session_start distribution) ===');
    const { rows: distribution } = await pool.query(`
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
      missing_sessions AS (
        SELECT DISTINCT pv.session_id
        FROM remote_session_tracker.event_page_view_enriched_v2 pv
        JOIN missing m ON m.ff_visitor_id = pv.ff_visitor_id
        WHERE pv.created_at >= $1::date AND pv.created_at < ($1::date + interval '1 day')
          AND pv.utm_campaign = $2
      )
      SELECT
        se.session_start::date AS session_date,
        se.entry_utm_campaign,
        COUNT(*) AS session_count,
        COUNT(DISTINCT se.ff_visitor_id) AS visitor_count
      FROM missing_sessions ms
      JOIN remote_session_tracker.session_entries se ON se.session_id = ms.session_id
      GROUP BY se.session_start::date, se.entry_utm_campaign
      ORDER BY session_date DESC, session_count DESC
    `, [DATE, CAMPAIGN_ID]);

    console.log('  session_date | entry_utm_campaign | sessions | visitors');
    for (const r of distribution) {
      console.log(`  ${r.session_date?.toISOString().split('T')[0]} | ${r.entry_utm_campaign ?? 'NULL'} | ${r.session_count} | ${r.visitor_count}`);
    }

    // 2. Key question: Do these sessions have entry_utm_campaign = our campaign?
    //    Just on a different day?
    console.log('\n=== 2. Aggregated: Same campaign vs different campaign ===');
    const { rows: agg } = await pool.query(`
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
      missing_sessions AS (
        SELECT DISTINCT pv.session_id
        FROM remote_session_tracker.event_page_view_enriched_v2 pv
        JOIN missing m ON m.ff_visitor_id = pv.ff_visitor_id
        WHERE pv.created_at >= $1::date AND pv.created_at < ($1::date + interval '1 day')
          AND pv.utm_campaign = $2
      )
      SELECT
        CASE WHEN se.entry_utm_campaign = $2 THEN 'same_campaign' ELSE 'diff_campaign' END AS campaign_match,
        CASE
          WHEN se.session_start::date = $1::date THEN 'same_day'
          WHEN se.session_start::date < $1::date THEN 'earlier_day'
          ELSE 'later_day'
        END AS day_bucket,
        COUNT(*) AS session_count
      FROM missing_sessions ms
      JOIN remote_session_tracker.session_entries se ON se.session_id = ms.session_id
      GROUP BY campaign_match, day_bucket
      ORDER BY campaign_match, day_bucket
    `, [DATE, CAMPAIGN_ID]);

    for (const r of agg) {
      console.log(`  ${r.campaign_match} / ${r.day_bucket}: ${r.session_count} sessions`);
    }

    // 3. For sessions that have SAME campaign but EARLIER day:
    //    How much earlier? (hours before midnight?)
    console.log('\n=== 3. Same-campaign earlier-day sessions: how long before Feb 16? ===');
    const { rows: timeDist } = await pool.query(`
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
      missing_sessions AS (
        SELECT DISTINCT pv.session_id
        FROM remote_session_tracker.event_page_view_enriched_v2 pv
        JOIN missing m ON m.ff_visitor_id = pv.ff_visitor_id
        WHERE pv.created_at >= $1::date AND pv.created_at < ($1::date + interval '1 day')
          AND pv.utm_campaign = $2
      )
      SELECT
        se.session_start::date AS session_date,
        COUNT(*) AS sessions
      FROM missing_sessions ms
      JOIN remote_session_tracker.session_entries se ON se.session_id = ms.session_id
      WHERE se.entry_utm_campaign = $2
        AND se.session_start < $1::date
      GROUP BY se.session_start::date
      ORDER BY session_date DESC
      LIMIT 10
    `, [DATE, CAMPAIGN_ID]);

    for (const r of timeDist) {
      console.log(`  ${r.session_date?.toISOString().split('T')[0]}: ${r.sessions} sessions`);
    }

    // 4. For sessions with DIFFERENT campaign on same or earlier day:
    //    What campaign do they have? And is the visitor_id matching?
    console.log('\n=== 4. Different-campaign sessions: what campaigns? ===');
    const { rows: diffCampaigns } = await pool.query(`
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
      missing_sessions AS (
        SELECT DISTINCT pv.session_id
        FROM remote_session_tracker.event_page_view_enriched_v2 pv
        JOIN missing m ON m.ff_visitor_id = pv.ff_visitor_id
        WHERE pv.created_at >= $1::date AND pv.created_at < ($1::date + interval '1 day')
          AND pv.utm_campaign = $2
      )
      SELECT
        se.entry_utm_campaign,
        COUNT(*) AS sessions
      FROM missing_sessions ms
      JOIN remote_session_tracker.session_entries se ON se.session_id = ms.session_id
      WHERE se.entry_utm_campaign != $2 OR se.entry_utm_campaign IS NULL
      GROUP BY se.entry_utm_campaign
      ORDER BY sessions DESC
      LIMIT 15
    `, [DATE, CAMPAIGN_ID]);

    for (const r of diffCampaigns) {
      console.log(`  ${r.entry_utm_campaign ?? 'NULL'}: ${r.sessions} sessions`);
    }

    // 5. Critical: visitors with page_seq=1 having this campaign —
    //    their session should have entry_utm_campaign = this campaign.
    //    Let's verify: do they?
    console.log('\n=== 5. Visitors with page_seq=1 having this campaign: session entry check ===');
    const { rows: seq1Check } = await pool.query(`
      WITH ordered AS (
        SELECT
          pv.*,
          ROW_NUMBER() OVER (PARTITION BY pv.session_id ORDER BY pv.created_at ASC, pv.id ASC) AS page_seq
        FROM remote_session_tracker.event_page_view_enriched_v2 pv
        WHERE pv.created_at >= $1::date AND pv.created_at < ($1::date + interval '1 day')
          AND pv.session_id IS NOT NULL
      ),
      entry_campaign AS (
        SELECT session_id, utm_campaign AS entry_campaign
        FROM ordered WHERE page_seq = 1 AND utm_campaign = $2
      )
      SELECT
        se.entry_utm_campaign AS se_entry_campaign,
        COUNT(*) AS session_count
      FROM entry_campaign ec
      JOIN remote_session_tracker.session_entries se ON se.session_id = ec.session_id
      GROUP BY se.entry_utm_campaign
      ORDER BY session_count DESC
      LIMIT 10
    `, [DATE, CAMPAIGN_ID]);

    console.log('  What entry_utm_campaign does session_entries have for these sessions?');
    for (const r of seq1Check) {
      console.log(`  ${r.se_entry_campaign ?? 'NULL'}: ${r.session_count} sessions`);
    }

    // 6. Same but check if session_entries exists at all for these
    console.log('\n=== 6. Sessions where page_seq=1 has this campaign: does SE exist? ===');
    const { rows: seq1Exists } = await pool.query(`
      WITH ordered AS (
        SELECT
          pv.*,
          ROW_NUMBER() OVER (PARTITION BY pv.session_id ORDER BY pv.created_at ASC, pv.id ASC) AS page_seq
        FROM remote_session_tracker.event_page_view_enriched_v2 pv
        WHERE pv.created_at >= $1::date AND pv.created_at < ($1::date + interval '1 day')
          AND pv.session_id IS NOT NULL
      ),
      entry_campaign AS (
        SELECT session_id
        FROM ordered WHERE page_seq = 1 AND utm_campaign = $2
      )
      SELECT
        COUNT(*) AS total_sessions,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM remote_session_tracker.session_entries se WHERE se.session_id = ec.session_id
        )) AS has_se,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM remote_session_tracker.session_entries se WHERE se.session_id = ec.session_id
        )) AS no_se
      FROM entry_campaign ec
    `, [DATE, CAMPAIGN_ID]);

    console.log(`  Total: ${seq1Exists[0].total_sessions}`);
    console.log(`  Has session_entry: ${seq1Exists[0].has_se}`);
    console.log(`  No session_entry: ${seq1Exists[0].no_se}`);

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
