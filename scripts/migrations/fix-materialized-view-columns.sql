-- Migration: Fix materialized view to include ALL columns from source view
-- The previous version was missing session_id, cta_viewed, cta_clicked, and other critical columns

DROP MATERIALIZED VIEW IF EXISTS remote_session_tracker.event_page_view_enriched_v2;

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

REFRESH MATERIALIZED VIEW remote_session_tracker.event_page_view_enriched_v2;

-- Verification
SELECT COUNT(*) as total_rows
FROM remote_session_tracker.event_page_view_enriched_v2;

-- Check that critical columns exist and have data
SELECT
    COUNT(*) as total,
    COUNT(session_id) as has_session_id,
    COUNT(CASE WHEN cta_viewed THEN 1 END) as cta_viewed_count,
    COUNT(CASE WHEN cta_clicked THEN 1 END) as cta_clicked_count
FROM remote_session_tracker.event_page_view_enriched_v2;
