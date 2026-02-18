/**
 * Verify: Does session_entries now match event_page_view_enriched_v2 after refresh?
 * Run: npx tsx scripts/verify-refresh-gap.ts
 */
import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const CAMPAIGN_ID = '23291867037'; // Balansera_Dnk_IM_24_11

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Check multiple dates
    for (const date of ['2026-02-16', '2026-02-17', '2026-02-18']) {
      const { rows } = await pool.query(`
        SELECT
          $2 AS date,
          (SELECT COUNT(DISTINCT ff_visitor_id)
           FROM remote_session_tracker.event_page_view_enriched_v2
           WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
             AND utm_campaign = $2) AS pv_visitors,
          (SELECT COUNT(DISTINCT ff_visitor_id)
           FROM remote_session_tracker.session_entries
           WHERE session_start >= $1::date AND session_start < ($1::date + interval '1 day')
             AND entry_utm_campaign = $2) AS se_visitors,
          (SELECT COUNT(*)
           FROM remote_session_tracker.session_entries
           WHERE session_start >= $1::date AND session_start < ($1::date + interval '1 day')
             AND entry_utm_campaign = $2) AS se_sessions
      `, [date, CAMPAIGN_ID]);

      const pvV = Number(rows[0].pv_visitors);
      const seV = Number(rows[0].se_visitors);
      const gap = pvV - seV;
      const pct = pvV > 0 ? ((seV / pvV) * 100).toFixed(1) : '-';

      console.log(`${date}: PV visitors=${pvV}  SE visitors=${seV}  SE sessions=${rows[0].se_sessions}  gap=${gap}  SE/PV=${pct}%`);
    }

    // Also check: visitors in PV but NOT in SE (should be 0 after proper refresh)
    console.log('\n--- Feb 16 detail: visitors in PV but missing from SE ---');
    const { rows: missing } = await pool.query(`
      WITH pv AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= '2026-02-16'::date AND created_at < '2026-02-17'::date
          AND utm_campaign = $1
      ),
      se AS (
        SELECT DISTINCT ff_visitor_id
        FROM remote_session_tracker.session_entries
        WHERE session_start >= '2026-02-16'::date AND session_start < '2026-02-17'::date
          AND entry_utm_campaign = $1
      )
      SELECT
        (SELECT COUNT(*) FROM pv WHERE ff_visitor_id NOT IN (SELECT ff_visitor_id FROM se)) AS in_pv_not_se,
        (SELECT COUNT(*) FROM se WHERE ff_visitor_id NOT IN (SELECT ff_visitor_id FROM pv)) AS in_se_not_pv
    `, [CAMPAIGN_ID]);
    console.log(`  In PV but not SE: ${missing[0].in_pv_not_se}`);
    console.log(`  In SE but not PV: ${missing[0].in_se_not_pv}`);

    // Also check: do those "missing" visitors have sessions with NO entry?
    // (their session_ids in PV but not in session_entries at all)
    console.log('\n--- Session IDs in PV but missing from SE entirely ---');
    const { rows: missingSessions } = await pool.query(`
      SELECT COUNT(DISTINCT pv.session_id) AS missing_session_ids
      FROM remote_session_tracker.event_page_view_enriched_v2 pv
      WHERE pv.created_at >= '2026-02-16'::date AND pv.created_at < '2026-02-17'::date
        AND pv.utm_campaign = $1
        AND pv.session_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM remote_session_tracker.session_entries se
          WHERE se.session_id = pv.session_id
        )
    `, [CAMPAIGN_ID]);
    console.log(`  Session IDs in PV but not in session_entries: ${missingSessions[0].missing_session_ids}`);

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
