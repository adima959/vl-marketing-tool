-- Migration: Normalize url_path in event_page_view_enriched_v2 materialized view
-- Purpose: Strip hash (#) and query (?) parameters from url_path at the view level
-- Impact: Improves query performance by avoiding SPLIT_PART on every row

-- IMPORTANT: This will drop and recreate the materialized view
-- Ensure no critical queries are running against this view

-- ============================================================================
-- STEP 1: Drop existing materialized view
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS remote_session_tracker.event_page_view_enriched_v2;

-- ============================================================================
-- STEP 2: Recreate with normalized url_path and ALL columns from source
-- ============================================================================

CREATE MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2 AS
SELECT
    id,
    created_at,
    local_hour_of_day,
    days_since_last_visit,
    last_heartbeat_at,
    page_leave_at,
    session_id,
    page_load_id,
    ff_visitor_id,
    ff_funnel_id,
    source_click_id,
    -- NORMALIZED: Strip everything after ? and # from url_path
    SPLIT_PART(SPLIT_PART(url_path, '?', 1), '#', 1) AS url_path,
    url_full,
    page_type,
    utm_source,
    utm_campaign,
    utm_content,
    utm_medium,
    utm_term,
    keyword,
    placement,
    ip,
    visit_number,
    user_agent,
    device_type,
    os_name,
    browser_name,
    language,
    platform,
    os_version,
    country_code,
    timezone,
    screen_width,
    screen_height,
    fcp_s,
    lcp_s,
    tti_s,
    dcl_s,
    load_s,
    active_time_s,
    scroll_percent,
    form_view,
    form_errors,
    form_errors_detail,
    form_started,
    hero_scroll_passed,
    cta_viewed,
    cta_clicked,
    referrer,
    forms,
    page_elements
FROM remote_session_tracker.event_page_view_enriched;

-- ============================================================================
-- STEP 3: Refresh the materialized view (populate with data)
-- ============================================================================

REFRESH MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check row count and critical columns
SELECT
    COUNT(*) as total_rows,
    COUNT(session_id) as has_session_id,
    COUNT(CASE WHEN cta_viewed THEN 1 END) as cta_viewed_count,
    COUNT(CASE WHEN form_errors > 0 THEN 1 END) as rows_with_errors
FROM remote_session_tracker.event_page_view_enriched_v2;

-- Check for URLs that were normalized (should show before/after examples)
SELECT
    url_full,
    url_path as normalized_path,
    COUNT(*) as occurrences
FROM remote_session_tracker.event_page_view_enriched_v2
WHERE url_full LIKE '%#%' OR url_full LIKE '%?%'
GROUP BY url_full, url_path
ORDER BY occurrences DESC
LIMIT 10;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- To rollback, uncomment and run:
-- DROP MATERIALIZED VIEW IF EXISTS remote_session_tracker.event_page_view_enriched_v2;
-- CREATE MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2 AS
-- SELECT * FROM remote_session_tracker.event_page_view_enriched;
-- REFRESH MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2;
