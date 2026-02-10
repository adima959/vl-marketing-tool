-- ============================================================
-- Migration for session_tracker database
-- Fix engagement metrics: active_time_s and scroll_percent
-- ============================================================
-- Date: 2026-02-09
-- Database: session_tracker (source)
-- Description: Fix active_time_s (calculate from engagement event timestamps)
--              and scroll_percent (JOIN with event_page_scroll table)
--
-- Issues fixed:
-- 1. active_time_s was trying to extract from properties JSONB but doesn't exist there
--    → Now calculated from GREATEST(created_at, max_scroll_at, max_signal_at, max_form_at)
--      capped by LEAST with page_leave_at, giving accurate time-on-page metric
-- 2. scroll_percent was trying to extract from properties JSONB but doesn't exist there
--    → Now JOINed from event_page_scroll table using MAX(depth) per page_load_id
-- 3. form_errors was using wrong JSONB key ('errors' instead of 'error_count')
--    → Now sums 'error_count' from each form in forms_properties
-- 4. form_errors_detail (NEW) aggregates all error objects from all forms into JSONB array
--    → Collects {field, value, message} objects for detailed error analysis
-- 5. hero_scroll_passed was using wrong JSONB key ('scroll_passed' instead of 'scrolled_past')
--    → Now checks 'scrolled_past' with ILIKE 'hero%' pattern
--
-- New JOINs added:
-- - event_page_scroll (eps): Max scroll depth and timestamp
-- - event_element_signal (epsig): Max element interaction timestamp
-- - event_form (ef): Max form interaction timestamp
-- ============================================================

-- FORWARD MIGRATION
-- ============================================================

-- Step 1: Drop existing view
DROP VIEW IF EXISTS public.event_page_view_enriched CASCADE;

-- Step 2: Recreate view with fixed engagement metrics
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

    -- UTM parameters (unchanged)
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

    -- Device info (unchanged)
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
    ROUND((epv.fcp_ms / 1000.0)::numeric, 2) AS fcp_s,
    ROUND((epv.lcp_ms / 1000.0)::numeric, 2) AS lcp_s,
    ROUND((epv.tti_ms / 1000.0)::numeric, 2) AS tti_s,
    ROUND((epv.dcl_ms / 1000.0)::numeric, 2) AS dcl_s,
    ROUND((epv.load_ms / 1000.0)::numeric, 2) AS load_s,

    -- ============================================================
    -- FIXED: Engagement metrics
    -- ============================================================
    -- Active time: Calculate from latest engagement event
    -- Uses GREATEST of (created_at, max_scroll_at, max_signal_at, max_form_at)
    -- Capped by LEAST of that and page_leave_at to not exceed when user left
    ROUND(
        EXTRACT(
            epoch
            FROM
                LEAST(
                    COALESCE(
                        epv.page_leave_at::timestamp with time zone,
                        'infinity'::timestamp with time zone
                    ),
                    GREATEST(
                        epv.created_at,
                        COALESCE(eps.max_scroll_at, epv.created_at),
                        COALESCE(epsig.max_signal_at, epv.created_at),
                        COALESCE(ef.max_form_at, epv.created_at)
                    )::timestamp with time zone
                ) - epv.created_at::timestamp with time zone
        ),
        2
    ) AS active_time_s,

    -- Scroll percent: Max scroll depth from event_page_scroll
    eps.max_scroll_percent AS scroll_percent,
    -- ============================================================

    -- Form tracking (FIXED: form_errors count + NEW: form_errors_detail)
    COALESCE(
        (
            SELECT bool_or(COALESCE((f.value ->> 'viewed')::boolean, false))
            FROM jsonb_each(epv.forms_properties) f(key, value)
        ),
        false
    ) AS form_view,
    COALESCE(
        (
            SELECT SUM(COALESCE((f.value ->> 'error_count')::integer, 0))
            FROM jsonb_each(epv.forms_properties) f(key, value)
        ),
        0::bigint
    ) AS form_errors,
    -- NEW: Aggregate all error objects from all forms into a JSONB array
    (
        SELECT jsonb_agg(error_obj)
        FROM (
            SELECT jsonb_array_elements(f.value -> 'errors') as error_obj
            FROM jsonb_each(epv.forms_properties) f(key, value)
            WHERE f.value -> 'errors' IS NOT NULL
              AND jsonb_typeof(f.value -> 'errors') = 'array'
        ) errors_list
    ) AS form_errors_detail,
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
            SELECT bool_or(COALESCE((e.value ->> 'scrolled_past')::boolean, false))
            FROM jsonb_each(epv.page_elements_properties) e(key, value)
            WHERE COALESCE(e.value ->> 'signal_id', '') ILIKE 'hero%'
        ),
        false
    ) AS hero_scroll_passed,

    -- CTA tracking (unchanged)
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

    -- Traffic source (unchanged)
    epv.properties->'client_info'->>'referrer' AS referrer,

    -- Raw JSONB (unchanged)
    epv.forms_properties AS forms,
    epv.page_elements_properties AS page_elements
FROM event_page_view epv
-- ============================================================
-- FIXED: JOIN with engagement event tables for active_time and scroll
-- ============================================================
-- event_page_scroll: Get max scroll depth and timestamp
LEFT JOIN (
    SELECT
        page_load_id,
        MAX(created_at) AS max_scroll_at,
        MAX(depth) AS max_scroll_percent
    FROM event_page_scroll
    GROUP BY page_load_id
) eps ON eps.page_load_id = epv.page_load_id
-- event_element_signal: Get max element interaction timestamp
LEFT JOIN (
    SELECT
        page_load_id,
        MAX(created_at) AS max_signal_at
    FROM event_element_signal
    GROUP BY page_load_id
) epsig ON epsig.page_load_id = epv.page_load_id
-- event_form: Get max form interaction timestamp
LEFT JOIN (
    SELECT
        page_load_id,
        MAX(created_at) AS max_form_at
    FROM event_form
    GROUP BY page_load_id
) ef ON ef.page_load_id = epv.page_load_id;
-- ============================================================

-- Step 3: Comment
COMMENT ON VIEW public.event_page_view_enriched IS
'Enriched page view analytics with extracted JSONB properties and aggregated metrics.
Updated 2026-02-09: Fixed engagement metrics and tracking
  - active_time_s: Calculated from GREATEST(created_at, max_scroll_at, max_signal_at, max_form_at) capped by page_leave_at
  - scroll_percent: JOINed from event_page_scroll MAX(depth)
  - form_errors: Fixed to use error_count key (was using errors)
  - form_errors_detail: NEW - JSONB array of all error objects with field, value, and message
  - hero_scroll_passed: Fixed to use scrolled_past key with hero% pattern (was using scroll_passed with hero)';


-- ROLLBACK INSTRUCTIONS
-- ============================================================
-- To rollback, restore the previous view definition from:
-- scripts/migrations/session-tracker-add-fields.sql
