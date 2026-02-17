-- ═══════════════════════════════════════════════════════════════════════════
-- Debug Index Usage - Test with EXACT application query
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Verify index exists and is valid
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname = 'idx_epv_campaign_medium_created';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Check table statistics
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  schemaname,
  relname as tablename,
  n_live_tup as row_count,
  n_dead_tup as dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'event_page_view_enriched_v2';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Test EXACT query from fetchAdLandingPages (with full complexity)
-- ───────────────────────────────────────────────────────────────────────────
-- Replace '120212081949250179' with a real campaign ID
EXPLAIN (ANALYZE true, BUFFERS true, FORMAT TEXT)
SELECT
  pv.utm_medium AS ad_id,
  pv.url_path,
  COUNT(*) AS page_views,
  COUNT(DISTINCT pv.ff_visitor_id) AS unique_visitors,
  ROUND(
    COUNT(*) FILTER (WHERE pv.active_time_s IS NOT NULL AND pv.active_time_s < 5)::numeric
    / NULLIF(COUNT(*) FILTER (WHERE pv.active_time_s IS NOT NULL), 0), 4
  ) AS bounce_rate,
  COUNT(*) FILTER (WHERE pv.hero_scroll_passed = true) AS scroll_past_hero,
  COUNT(*) FILTER (WHERE pv.form_view = true) AS form_views,
  COUNT(*) FILTER (WHERE pv.form_started = true) AS form_starters,
  ROUND(AVG(pv.active_time_s)::numeric, 2) AS avg_time_on_page
FROM remote_session_tracker.event_page_view_enriched_v2 pv
WHERE pv.created_at >= '2026-02-10T00:00:00'::timestamp
  AND pv.created_at <= '2026-02-17T23:59:59.999'::timestamp
  AND pv.utm_campaign = '120212081949250179'  -- Replace with real campaign ID
  AND pv.utm_medium IS NOT NULL
  AND pv.utm_medium != ''
GROUP BY pv.utm_medium, pv.url_path
ORDER BY pv.utm_medium, COUNT(*) DESC;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Check selectivity of utm_campaign filter (how many rows match?)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) as total_rows_for_campaign
FROM remote_session_tracker.event_page_view_enriched_v2 pv
WHERE pv.created_at >= '2026-02-10T00:00:00'::timestamp
  AND pv.created_at <= '2026-02-17T23:59:59.999'::timestamp
  AND pv.utm_campaign = '120212081949250179'  -- Replace with real campaign ID
  AND pv.utm_medium IS NOT NULL
  AND pv.utm_medium != '';

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Force index usage to see the difference (diagnostic only)
-- ───────────────────────────────────────────────────────────────────────────
SET enable_seqscan = off;  -- Force index usage

EXPLAIN (ANALYZE true, BUFFERS true, FORMAT TEXT)
SELECT
  pv.utm_medium AS ad_id,
  pv.url_path,
  COUNT(*) AS page_views
FROM remote_session_tracker.event_page_view_enriched_v2 pv
WHERE pv.created_at >= '2026-02-10T00:00:00'::timestamp
  AND pv.created_at <= '2026-02-17T23:59:59.999'::timestamp
  AND pv.utm_campaign = '120212081949250179'  -- Replace with real campaign ID
  AND pv.utm_medium IS NOT NULL
  AND pv.utm_medium != ''
GROUP BY pv.utm_medium, pv.url_path
ORDER BY pv.utm_medium, COUNT(*) DESC;

SET enable_seqscan = on;  -- Re-enable seq scans

-- ═══════════════════════════════════════════════════════════════════════════
-- What to look for:
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Section 1: Index should exist
-- Section 2: last_analyze should be recent (just ran)
-- Section 3: Should show "Index Scan" if working, "Seq Scan" if not
-- Section 4: If this returns 10,000+ rows, seq scan might actually be faster!
-- Section 5: Compare execution time with forced index vs normal
-- ═══════════════════════════════════════════════════════════════════════════
