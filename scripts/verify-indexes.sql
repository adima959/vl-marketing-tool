-- ═══════════════════════════════════════════════════════════════════════════
-- Index Verification & Performance Diagnostic
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this query and share the results to verify indexes are working correctly
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Check which indexes were created successfully
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(schemaname||'.'||indexname::text)) AS index_size,
  CASE
    WHEN indexname LIKE '%campaign_date%' THEN '✓ Campaign + Date index'
    WHEN indexname LIKE '%adset%' THEN '✓ Adset level index'
    WHEN indexname LIKE '%ad_date%' THEN '✓ Ad level index'
    WHEN indexname LIKE '%medium_created%' THEN '✓ Landing page index (CRITICAL)'
    WHEN indexname LIKE '%campaign_created%' THEN '✓ On-page metrics index'
    WHEN indexname LIKE '%funnel%' THEN '✓ FunnelFlux index'
    ELSE indexname
  END AS description
FROM pg_indexes
WHERE indexname IN (
  'idx_mas_campaign_date',
  'idx_mas_campaign_adset_date',
  'idx_mas_campaign_ad_date',
  'idx_epv_campaign_medium_created',
  'idx_epv_campaign_created',
  'idx_epv_campaign_funnel_created'
)
ORDER BY
  CASE tablename
    WHEN 'marketing_merged_ads_spending' THEN 1
    ELSE 2
  END,
  indexname;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Table sizes (for context)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  schemaname || '.' || tablename AS table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE tablename IN ('marketing_merged_ads_spending', 'event_page_view_enriched_v2')
ORDER BY tablename;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Test query plan for the CRITICAL landing page query
-- ───────────────────────────────────────────────────────────────────────────
-- Replace 'YOUR_CAMPAIGN_ID' with a real campaign ID from your data
-- This shows if PostgreSQL is using the new index

EXPLAIN (FORMAT TEXT, ANALYZE false, COSTS true, BUFFERS false)
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

-- ═══════════════════════════════════════════════════════════════════════════
-- Expected Results:
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Section 1: Should show 6 indexes with their sizes
-- Section 2: Should show table sizes (context for index overhead)
-- Section 3: Should show query plan using "idx_epv_campaign_medium_created"
--
-- Look for "Index Scan using idx_epv_campaign_medium_created" in Section 3
-- If you see "Seq Scan" instead, the index isn't being used (bad!)
-- ═══════════════════════════════════════════════════════════════════════════
