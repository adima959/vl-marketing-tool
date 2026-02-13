-- Migration: Create session_entries materialized view
-- Purpose: Pre-compute one row per session with entry page info, funnel flags,
--          and session-level metrics for session-based on-page analytics.
-- Source: remote_session_tracker.event_page_view_enriched_v2
-- Depends on: event_page_view_enriched_v2 must exist and be populated
--
-- Run via: Execute SQL directly against the Neon PostgreSQL database
-- Refresh via: npx tsx scripts/refresh-session-entries.ts
-- Rollback: DROP MATERIALIZED VIEW IF EXISTS remote_session_tracker.session_entries;

-- ============================================================================
-- STEP 1: Drop existing view if recreating
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS remote_session_tracker.session_entries;

-- ============================================================================
-- STEP 2: Create materialized view
-- ============================================================================

CREATE MATERIALIZED VIEW remote_session_tracker.session_entries AS
WITH ordered_views AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY session_id
      ORDER BY created_at ASC, id ASC
    ) AS page_seq
  FROM remote_session_tracker.event_page_view_enriched_v2
  WHERE session_id IS NOT NULL
)
SELECT
  -- Session identity
  session_id,
  -- Pick visitor ID from the first page view (not in GROUP BY to avoid
  -- splitting sessions where fingerprint changes mid-session)
  MAX(ff_visitor_id) FILTER (WHERE page_seq = 1) AS ff_visitor_id,

  -- Entry page info (from first page view in session)
  -- Strip https:// for cleaner display (domain + path)
  REGEXP_REPLACE(
    MAX(url_path) FILTER (WHERE page_seq = 1),
    '^https?://', ''
  ) AS entry_url_path,
  MAX(url_full)     FILTER (WHERE page_seq = 1) AS entry_url_full,
  MAX(page_type)    FILTER (WHERE page_seq = 1) AS entry_page_type,
  MIN(created_at)   AS session_start,
  MAX(created_at)   AS session_end,

  -- Entry page UTM (for dimension grouping)
  MAX(utm_source)   FILTER (WHERE page_seq = 1) AS entry_utm_source,
  MAX(utm_campaign) FILTER (WHERE page_seq = 1) AS entry_utm_campaign,
  MAX(utm_content)  FILTER (WHERE page_seq = 1) AS entry_utm_content,
  MAX(utm_medium)   FILTER (WHERE page_seq = 1) AS entry_utm_medium,
  MAX(utm_term)     FILTER (WHERE page_seq = 1) AS entry_utm_term,
  MAX(keyword)      FILTER (WHERE page_seq = 1) AS entry_keyword,
  MAX(placement)    FILTER (WHERE page_seq = 1) AS entry_placement,
  MAX(referrer)     FILTER (WHERE page_seq = 1) AS entry_referrer,

  -- Entry page audience info
  MAX(country_code) FILTER (WHERE page_seq = 1) AS entry_country_code,
  MAX(device_type)  FILTER (WHERE page_seq = 1) AS entry_device_type,
  MAX(os_name)      FILTER (WHERE page_seq = 1) AS entry_os_name,
  MAX(browser_name) FILTER (WHERE page_seq = 1) AS entry_browser_name,
  MAX(visit_number) FILTER (WHERE page_seq = 1) AS visit_number,
  MAX(ff_funnel_id) FILTER (WHERE page_seq = 1) AS ff_funnel_id,

  -- Entry page engagement
  MAX(active_time_s)              FILTER (WHERE page_seq = 1) AS entry_active_time_s,
  MAX(scroll_percent)             FILTER (WHERE page_seq = 1) AS entry_scroll_percent,
  BOOL_OR(hero_scroll_passed)   FILTER (WHERE page_seq = 1) AS entry_hero_scroll_passed,
  BOOL_OR(form_view)            FILTER (WHERE page_seq = 1) AS entry_form_view,
  BOOL_OR(form_started)         FILTER (WHERE page_seq = 1) AS entry_form_started,
  BOOL_OR(cta_viewed)           FILTER (WHERE page_seq = 1) AS entry_cta_viewed,
  BOOL_OR(cta_clicked)          FILTER (WHERE page_seq = 1) AS entry_cta_clicked,

  -- Session-level aggregate metrics
  COUNT(*)                     AS total_page_views,
  COUNT(DISTINCT url_path)     AS unique_pages_visited,
  SUM(active_time_s)           AS total_active_time_s,

  -- Funnel progression flags
  -- Uses page_type when set, URL pattern fallback for shop.vitaliv.com (null page_type)
  BOOL_OR(page_type = 'pdp' OR page_type = 'pdp-order-form') AS reached_pdp,
  BOOL_OR(page_type = 'order-page' OR (page_type IS NULL AND url_path LIKE '%/order/%')) AS reached_order,
  BOOL_OR(page_type = 'xsell') AS reached_xsell,
  BOOL_OR(page_type = 'thank-you' OR (page_type IS NULL AND url_path LIKE '%/thankyou/%')) AS reached_thankyou

FROM ordered_views
GROUP BY session_id;

-- ============================================================================
-- STEP 3: Create indexes
-- ============================================================================

CREATE INDEX idx_se_entry_url     ON remote_session_tracker.session_entries (entry_url_path);
CREATE INDEX idx_se_session_start ON remote_session_tracker.session_entries (session_start);
CREATE INDEX idx_se_visitor       ON remote_session_tracker.session_entries (ff_visitor_id);
CREATE INDEX idx_se_utm_source    ON remote_session_tracker.session_entries (entry_utm_source, session_start);
CREATE INDEX idx_se_country       ON remote_session_tracker.session_entries (entry_country_code, session_start);
CREATE INDEX idx_se_device        ON remote_session_tracker.session_entries (entry_device_type, session_start);
CREATE INDEX idx_se_page_type     ON remote_session_tracker.session_entries (entry_page_type, session_start);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Basic counts
SELECT
  COUNT(*) as total_sessions,
  COUNT(DISTINCT ff_visitor_id) as unique_visitors,
  ROUND(AVG(total_page_views), 2) as avg_pages_per_session,
  SUM(CASE WHEN total_page_views = 1 THEN 1 ELSE 0 END) as bounce_sessions,
  ROUND(100.0 * SUM(CASE WHEN total_page_views = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as bounce_rate_pct
FROM remote_session_tracker.session_entries;

-- Funnel progression summary
SELECT
  COUNT(*) as total_sessions,
  SUM(reached_pdp::int) as reached_pdp,
  SUM(reached_order::int) as reached_order,
  SUM(reached_xsell::int) as reached_xsell,
  SUM(reached_thankyou::int) as reached_thankyou,
  ROUND(100.0 * SUM(reached_pdp::int) / COUNT(*), 2) as pdp_pct,
  ROUND(100.0 * SUM(reached_order::int) / COUNT(*), 2) as order_pct,
  ROUND(100.0 * SUM(reached_xsell::int) / COUNT(*), 2) as xsell_pct,
  ROUND(100.0 * SUM(reached_thankyou::int) / COUNT(*), 2) as thankyou_pct
FROM remote_session_tracker.session_entries;

-- Top 10 entry pages
SELECT
  entry_url_path,
  COUNT(*) as sessions,
  ROUND(100.0 * SUM(reached_thankyou::int) / COUNT(*), 1) as thankyou_pct,
  ROUND(AVG(total_page_views), 1) as avg_pages
FROM remote_session_tracker.session_entries
GROUP BY entry_url_path
ORDER BY sessions DESC
LIMIT 10;

-- ============================================================================
-- ROLLBACK
-- ============================================================================

-- DROP MATERIALIZED VIEW IF EXISTS remote_session_tracker.session_entries;
