-- ============================================================
-- Migration: Add 9 new fields to event_page_view_enriched_v2
-- ============================================================
-- Date: 2026-02-09
-- Description: Adds session_id, keyword, placement, user_agent, language,
--              platform, referrer, os_version, cta_viewed, cta_clicked
--
-- Note: event_page_view_enriched is a FOREIGN TABLE (external source)
--       We update the materialized view to include additional fields

-- FORWARD MIGRATION
-- ============================================================

-- Step 1: Drop existing materialized view
DROP MATERIALIZED VIEW IF EXISTS remote_session_tracker.event_page_view_enriched_v2;

-- Step 2: Recreate materialized view with new fields from foreign table
CREATE MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2 AS
SELECT
    -- Base fields
    id,
    created_at,
    ff_visitor_id,
    ff_funnel_id,

    -- URL normalization
    SPLIT_PART(SPLIT_PART(url_path, '?', 1), '#', 1) AS url_path,
    url_full,
    page_type,

    -- UTM parameters (existing + NEW: keyword, placement)
    utm_source,
    utm_campaign,
    utm_content,
    utm_medium,
    utm_term,
    keyword,
    placement,

    -- Device info (existing + NEW: user_agent, language, platform, os_version)
    device_type,
    os_name,
    browser_name,
    user_agent,
    language,
    platform,
    os_version,

    -- Location
    country_code,
    timezone,
    local_hour_of_day,

    -- Traffic source (NEW: referrer)
    referrer,

    -- Session info (NEW: session_id)
    session_id,
    visit_number,

    -- Engagement metrics
    active_time_s,
    scroll_percent,

    -- Performance metrics
    fcp_s,
    lcp_s,
    tti_s,

    -- Form tracking
    form_view,
    form_started,
    form_errors,

    -- Hero scroll tracking
    hero_scroll_passed,

    -- CTA tracking (NEW: cta_viewed, cta_clicked)
    cta_viewed,
    cta_clicked

    -- Raw JSONB columns removed (page_elements, forms)
FROM remote_session_tracker.event_page_view_enriched;

-- Step 3: Comment
COMMENT ON MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2 IS
'Materialized view with URL normalization and enriched fields.
Added 2026-02-09: session_id, keyword, placement, user_agent, language, platform,
referrer, os_version, cta_viewed, cta_clicked';


-- ROLLBACK INSTRUCTIONS
-- ============================================================
-- To rollback, recreate the materialized view without the new fields:
--
-- DROP MATERIALIZED VIEW IF EXISTS remote_session_tracker.event_page_view_enriched_v2;
-- CREATE MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2 AS
-- SELECT id, created_at, ff_visitor_id, ff_funnel_id,
--        SPLIT_PART(SPLIT_PART(url_path, '?', 1), '#', 1) AS url_path,
--        url_full, page_type, utm_source, utm_campaign, utm_content, utm_medium, utm_term,
--        device_type, os_name, browser_name, country_code, timezone, local_hour_of_day,
--        visit_number, active_time_s, scroll_percent, fcp_s, lcp_s, tti_s,
--        form_view, form_started, form_errors, hero_scroll_passed, page_elements
-- FROM remote_session_tracker.event_page_view_enriched;
-- REFRESH MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2;
