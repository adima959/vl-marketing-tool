-- ============================================================
-- Migration for session_tracker database
-- Add 9 new fields to event_page_view_enriched view
-- ============================================================
-- Date: 2026-02-09
-- Database: session_tracker (source)
-- Description: Adds keyword, placement, user_agent, language,
--              platform, referrer, os_version, cta_viewed, cta_clicked

-- FORWARD MIGRATION
-- ============================================================

-- Step 1: Drop existing view
DROP VIEW IF EXISTS public.event_page_view_enriched CASCADE;

-- Step 2: Recreate view with new fields
CREATE VIEW public.event_page_view_enriched AS
SELECT
    -- Base fields (unchanged)
    epv.id,
    epv.created_at,
    epv.local_hour_of_day,
    epv.days_since_last_visit,
    epv.last_heartbeat_at,
    epv.page_leave_at,
    epv.session_id,
    epv.page_load_id,
    epv.ff_visitor_id,
    epv.ff_funnel_id,
    epv.source_click_id,
    
    -- URL fields (unchanged)
    epv.url_path,
    epv.url_full,
    epv.page_type,
    
    -- UTM parameters (existing + NEW: keyword, placement - extracted from url_full)
    epv.utm_source,
    epv.utm_campaign,
    epv.utm_content,
    epv.utm_medium,
    epv.utm_term,
    -- Extract keyword from URL query string
    NULLIF(
        (regexp_match(epv.url_full, '[?&]keyword=([^&]*)', 'i'))[1],
        ''
    ) AS keyword,
    -- Extract placement from URL query string (URL decoded)
    NULLIF(
        regexp_replace(
            (regexp_match(epv.url_full, '[?&]placement=([^&]*)', 'i'))[1],
            '%3A%3A', '::', 'gi'
        ),
        ''
    ) AS placement,
    
    -- IP (unchanged)
    epv.ip,
    
    -- Session info (unchanged)
    epv.visit_number,
    
    -- Device info (existing + NEW: user_agent, language, platform, os_version)
    epv.user_agent,
    epv.device_type,
    epv.os_name,
    epv.browser_name,
    epv.properties->'client_info'->>'language' AS language,
    epv.properties->'client_info'->>'platform' AS platform,
    epv.properties->'client_info'->'os'->>'version' AS os_version,
    
    -- Location (unchanged)
    epv.country_code,
    epv.timezone,
    
    -- Screen dimensions (unchanged)
    epv.screen_width,
    epv.screen_height,
    
    -- Performance metrics (unchanged)
    (epv.fcp_ms / 1000.0) AS fcp_s,
    (epv.lcp_ms / 1000.0) AS lcp_s,
    (epv.tti_ms / 1000.0) AS tti_s,
    (epv.dcl_ms / 1000.0) AS dcl_s,
    (epv.load_ms / 1000.0) AS load_s,
    
    -- Engagement metrics (unchanged)
    COALESCE((epv.properties->>'active_time_s')::numeric, 0) AS active_time_s,
    COALESCE((epv.properties->>'scroll_percent')::smallint, 0) AS scroll_percent,
    
    -- Form tracking (unchanged)
    COALESCE(
        (
            SELECT bool_or(COALESCE((f.value ->> 'viewed')::boolean, false))
            FROM jsonb_each(epv.forms_properties) f(key, value)
        ),
        false
    ) AS form_view,
    COALESCE((epv.forms_properties->>'errors')::bigint, 0) AS form_errors,
    COALESCE(
        (
            SELECT bool_or(COALESCE((f.value ->> 'started')::boolean, false))
            FROM jsonb_each(epv.forms_properties) f(key, value)
        ),
        false
    ) AS form_started,
    
    -- Hero scroll tracking (unchanged)
    COALESCE(
        (
            SELECT bool_or(COALESCE((e.value ->> 'scroll_passed')::boolean, false))
            FROM jsonb_each(epv.page_elements_properties) e(key, value)
            WHERE COALESCE(e.value ->> 'signal_id', '') = 'hero'
        ),
        false
    ) AS hero_scroll_passed,
    
    -- CTA tracking (NEW: cta_viewed, cta_clicked)
    COALESCE(
        (
            SELECT bool_or(COALESCE((e.value ->> 'viewed')::boolean, false))
            FROM jsonb_each(epv.page_elements_properties) e(key, value)
            WHERE COALESCE(e.value ->> 'signal_id', '') ILIKE 'CTA%'
        ),
        false
    ) AS cta_viewed,
    COALESCE(
        (
            SELECT bool_or(COALESCE((e.value ->> 'clicked')::boolean, false))
            FROM jsonb_each(epv.page_elements_properties) e(key, value)
            WHERE COALESCE(e.value ->> 'signal_id', '') ILIKE 'CTA%'
        ),
        false
    ) AS cta_clicked,
    
    -- Traffic source (NEW: referrer)
    epv.properties->'client_info'->>'referrer' AS referrer,
    
    -- Raw JSONB (unchanged)
    epv.forms_properties AS forms,
    epv.page_elements_properties AS page_elements
FROM event_page_view epv;

-- Step 3: Comment
COMMENT ON VIEW public.event_page_view_enriched IS
'Enriched page view analytics with extracted JSONB properties and aggregated metrics.
Updated 2026-02-09: Added keyword, placement, user_agent, language, platform,
referrer, os_version, cta_viewed, cta_clicked';


-- ROLLBACK INSTRUCTIONS
-- ============================================================
-- To rollback, recreate the view without the new fields.
-- Use the previous view definition from git history or backup.

