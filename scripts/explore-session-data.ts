/**
 * Data Exploration: Session-Based On-Page Analytics
 *
 * Answers 7 open questions from docs/plans/2026-02-12-session-based-on-page-analytics.md
 * to validate session_id coverage, page_type values, session size distribution, etc.
 *
 * Usage: npx tsx scripts/explore-session-data.ts
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

function createPgPool(): Pool {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  return new Pool({ connectionString: dbUrl });
}

async function main(): Promise<void> {
  const pg = createPgPool();

  try {
    // Q1: session_id Coverage
    console.log('\n========================================');
    console.log('Q1: session_id Coverage');
    console.log('========================================');
    const q1 = await pg.query(`
      SELECT
        COUNT(*) as total,
        COUNT(session_id) as has_session_id,
        COUNT(*) - COUNT(session_id) as missing_session_id,
        ROUND(100.0 * COUNT(session_id) / COUNT(*), 2) as coverage_pct
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE created_at >= '2026-01-01'
    `);
    console.table(q1.rows);

    // Q2: Session Size Distribution
    console.log('\n========================================');
    console.log('Q2: Session Size Distribution (pages per session)');
    console.log('========================================');
    const q2 = await pg.query(`
      SELECT
        CASE
          WHEN total_page_views = 1 THEN '1 page (bounce)'
          WHEN total_page_views = 2 THEN '2 pages'
          WHEN total_page_views = 3 THEN '3 pages'
          WHEN total_page_views BETWEEN 4 AND 5 THEN '4-5 pages'
          WHEN total_page_views BETWEEN 6 AND 10 THEN '6-10 pages'
          WHEN total_page_views BETWEEN 11 AND 20 THEN '11-20 pages'
          ELSE '21+ pages'
        END as bucket,
        COUNT(*) as session_count,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct,
        MIN(total_page_views) as min_sort
      FROM (
        SELECT session_id, COUNT(*) as total_page_views
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= '2026-01-01' AND session_id IS NOT NULL
        GROUP BY session_id
      ) s
      GROUP BY bucket
      ORDER BY min_sort
    `);
    console.table(q2.rows.map(({ bucket, session_count, pct }) => ({ bucket, session_count, pct })));

    // Also get raw stats
    const q2b = await pg.query(`
      SELECT
        COUNT(DISTINCT session_id) as total_sessions,
        ROUND(AVG(cnt), 1) as avg_pages,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cnt) as median_pages,
        MAX(cnt) as max_pages
      FROM (
        SELECT session_id, COUNT(*) as cnt
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= '2026-01-01' AND session_id IS NOT NULL
        GROUP BY session_id
      ) s
    `);
    console.log('Summary stats:');
    console.table(q2b.rows);

    // Q3: page_type Values
    console.log('\n========================================');
    console.log('Q3: page_type Distribution');
    console.log('========================================');
    const q3 = await pg.query(`
      SELECT
        COALESCE(page_type, '(null)') as page_type,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE created_at >= '2026-01-01'
      GROUP BY page_type
      ORDER BY count DESC
    `);
    console.table(q3.rows);

    // Q4: Entry Page Distribution
    console.log('\n========================================');
    console.log('Q4: Top 30 Entry Pages');
    console.log('========================================');
    const q4 = await pg.query(`
      WITH first_pages AS (
        SELECT DISTINCT ON (session_id) session_id, url_path
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= '2026-01-01' AND session_id IS NOT NULL
        ORDER BY session_id, created_at ASC, id ASC
      )
      SELECT
        url_path,
        COUNT(*) as sessions,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
      FROM first_pages
      GROUP BY url_path
      ORDER BY sessions DESC
      LIMIT 30
    `);
    console.table(q4.rows);

    // Also count total distinct entry pages
    const q4b = await pg.query(`
      WITH first_pages AS (
        SELECT DISTINCT ON (session_id) session_id, url_path
        FROM remote_session_tracker.event_page_view_enriched_v2
        WHERE created_at >= '2026-01-01' AND session_id IS NOT NULL
        ORDER BY session_id, created_at ASC, id ASC
      )
      SELECT COUNT(DISTINCT url_path) as distinct_entry_pages
      FROM first_pages
    `);
    console.log(`Total distinct entry pages: ${q4b.rows[0].distinct_entry_pages}`);

    // Q5: Session Duration
    console.log('\n========================================');
    console.log('Q5: Session Duration Distribution');
    console.log('========================================');
    const q5 = await pg.query(`
      SELECT
        bucket,
        sessions,
        ROUND(100.0 * sessions / SUM(sessions) OVER (), 2) as pct
      FROM (
        SELECT
          CASE
            WHEN duration_minutes < 1 THEN '1: < 1 min'
            WHEN duration_minutes < 5 THEN '2: 1-5 min'
            WHEN duration_minutes < 15 THEN '3: 5-15 min'
            WHEN duration_minutes < 30 THEN '4: 15-30 min'
            WHEN duration_minutes < 60 THEN '5: 30-60 min'
            WHEN duration_minutes < 1440 THEN '6: 1-24 hours'
            ELSE '7: > 24 hours'
          END as bucket,
          COUNT(*) as sessions
        FROM (
          SELECT
            session_id,
            EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 60 as duration_minutes
          FROM remote_session_tracker.event_page_view_enriched_v2
          WHERE created_at >= '2026-01-01' AND session_id IS NOT NULL
          GROUP BY session_id
        ) s
        GROUP BY bucket
      ) d
      ORDER BY bucket
    `);
    console.table(q5.rows);

    // Q6: Funnel Stage URL Patterns
    console.log('\n========================================');
    console.log('Q6: Funnel-Related URLs & page_type');
    console.log('========================================');
    const q6 = await pg.query(`
      SELECT url_path, COALESCE(page_type, '(null)') as page_type, COUNT(*) as views
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE created_at >= '2026-01-01'
        AND (
          url_path ILIKE '%checkout%' OR url_path ILIKE '%thankyou%'
          OR url_path ILIKE '%thank-you%' OR url_path ILIKE '%order%'
          OR url_path ILIKE '%upsell%' OR url_path ILIKE '%cross-sell%'
          OR url_path ILIKE '%excel%' OR url_path ILIKE '%confirm%'
          OR page_type IN ('checkout', 'thankyou', 'upsell', 'order', 'crosssell')
        )
      GROUP BY url_path, page_type
      ORDER BY views DESC
      LIMIT 50
    `);
    console.table(q6.rows);

    // Q7: Monthly Volume
    console.log('\n========================================');
    console.log('Q7: Monthly Session & Page View Volumes');
    console.log('========================================');
    const q7 = await pg.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        COUNT(DISTINCT session_id) as sessions,
        COUNT(*) as page_views,
        COUNT(DISTINCT ff_visitor_id) as visitors,
        ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT session_id), 0), 1) as avg_pages_per_session
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE created_at >= '2025-10-01' AND session_id IS NOT NULL
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month
    `);
    console.table(q7.rows);

    console.log('\n========================================');
    console.log('Exploration complete!');
    console.log('========================================');
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
