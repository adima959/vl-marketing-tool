-- ═══════════════════════════════════════════════════════════════════════════
-- Performance Indexes for Campaign Hierarchy Queries
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Run these indexes to speed up marketing pipeline campaign detail loading.
-- All indexes use CONCURRENTLY to avoid blocking production traffic.
--
-- Estimated impact: 2-10x speedup on campaign hierarchy API calls
-- Safe to run in production: Yes (CONCURRENTLY = non-blocking)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Indexes for marketing_merged_ads_spending
-- ───────────────────────────────────────────────────────────────────────────

-- General campaign + date index (for fetchAdsMetrics)
-- Supports: WHERE m.date >= X AND m.date <= Y AND m.campaign_id = ANY(...)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mas_campaign_date
  ON marketing_merged_ads_spending (campaign_id, date);

-- Adset-level queries (for fetchAdsetMetrics)
-- Supports: WHERE m.date >= X AND m.date <= Y AND m.campaign_id = X AND m.adset_id IS NOT NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mas_campaign_adset_date
  ON marketing_merged_ads_spending (campaign_id, adset_id, date)
  WHERE adset_id IS NOT NULL AND adset_id != '';

-- Ad-level queries (for fetchAdMetrics)
-- Supports: WHERE m.date >= X AND m.date <= Y AND m.campaign_id = X AND m.ad_id IS NOT NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mas_campaign_ad_date
  ON marketing_merged_ads_spending (campaign_id, ad_id, adset_id, date)
  WHERE ad_id IS NOT NULL AND ad_id != '';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Indexes for event_page_view_enriched_v2
-- ───────────────────────────────────────────────────────────────────────────

-- Landing page metrics (for fetchAdLandingPages)
-- Supports: WHERE created_at >= X AND created_at <= Y AND utm_campaign = X AND utm_medium IS NOT NULL
-- This is the CRITICAL index for the slowest query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_epv_campaign_medium_created
  ON remote_session_tracker.event_page_view_enriched_v2 (utm_campaign, utm_medium, created_at)
  WHERE utm_medium IS NOT NULL AND utm_medium != '';

-- General on-page metrics (for fetchOnPageMetrics)
-- Supports: WHERE created_at >= X AND created_at <= Y AND utm_campaign = ANY(...)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_epv_campaign_created
  ON remote_session_tracker.event_page_view_enriched_v2 (utm_campaign, created_at);

-- FunnelFlux ID lookup (for fetchFunnelFluxIds)
-- Supports: WHERE created_at >= X AND created_at <= Y AND utm_campaign = X AND ff_funnel_id IS NOT NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_epv_campaign_funnel_created
  ON remote_session_tracker.event_page_view_enriched_v2 (utm_campaign, created_at, ff_funnel_id)
  WHERE ff_funnel_id IS NOT NULL AND ff_funnel_id != '';

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification Queries
-- ═══════════════════════════════════════════════════════════════════════════

-- Check index creation progress (run in separate session while indexes are building):
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE indexname LIKE 'idx_mas_%' OR indexname LIKE 'idx_epv_%'
-- ORDER BY tablename, indexname;

-- Check index sizes after creation:
-- SELECT
--   schemaname || '.' || tablename AS table,
--   indexname,
--   pg_size_pretty(pg_relation_size(schemaname||'.'||indexname::text)) AS index_size
-- FROM pg_indexes
-- WHERE indexname LIKE 'idx_mas_%' OR indexname LIKE 'idx_epv_%'
-- ORDER BY pg_relation_size(schemaname||'.'||indexname::text) DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback (if needed)
-- ═══════════════════════════════════════════════════════════════════════════

-- DROP INDEX CONCURRENTLY IF EXISTS idx_mas_campaign_date;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_mas_campaign_adset_date;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_mas_campaign_ad_date;
-- DROP INDEX CONCURRENTLY IF EXISTS remote_session_tracker.idx_epv_campaign_medium_created;
-- DROP INDEX CONCURRENTLY IF EXISTS remote_session_tracker.idx_epv_campaign_created;
-- DROP INDEX CONCURRENTLY IF EXISTS remote_session_tracker.idx_epv_campaign_funnel_created;
