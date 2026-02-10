-- Migration: Fix form_errors_detail to work with actual JSONB structure
-- The actual structure uses field_error_count object, not an errors array
-- Example: {"email": 2, "gov_id": 12} means email had 2 errors, gov_id had 12

-- DROP AND RECREATE VIEW
DROP VIEW IF EXISTS public.event_page_view_enriched CASCADE;

CREATE OR REPLACE VIEW public.event_page_view_enriched AS
SELECT
    epv.id,
    epv.created_at,
    epv.ff_visitor_id,
    epv.ff_funnel_id,
    epv.url_path,
    epv.url_full,
    epv.page_type,
    epv.utm_source,
    epv.utm_campaign,
    epv.utm_content,
    epv.utm_medium,
    epv.utm_term,
    epv.device_type,
    epv.os_name,
    epv.browser_name,
    epv.country_code,
    epv.timezone,
    epv.local_hour_of_day,
    -- Session columns from session table
    s.visit_number,
    s.time_per_session_s AS active_time_s,
    s.max_scroll AS scroll_percent,
    epv.fcp_s,
    epv.lcp_s,
    epv.tti_s,
    -- Form engagement metrics
    COALESCE(
        (
            SELECT bool_or(COALESCE((f.value ->> 'viewed')::boolean, false))
            FROM jsonb_each(epv.forms_properties) f(key, value)
        ),
        false
    ) AS form_view,
    COALESCE(
        (
            SELECT bool_or(COALESCE((f.value ->> 'started')::boolean, false))
            FROM jsonb_each(epv.forms_properties) f(key, value)
        ),
        false
    ) AS form_started,
    -- FIXED: Sum error_count from all forms
    COALESCE(
        (
            SELECT SUM(COALESCE((f.value ->> 'error_count')::integer, 0))
            FROM jsonb_each(epv.forms_properties) f(key, value)
        ),
        0::bigint
    ) AS form_errors,
    -- FIXED: Extract field_error_count objects from all forms
    -- Returns array like: [{"field": "email", "error_count": 2}, {"field": "gov_id", "12"}]
    (
        SELECT jsonb_agg(
            jsonb_build_object(
                'field', field_key,
                'error_count', field_value::integer
            )
        )
        FROM (
            SELECT field_key, field_value
            FROM jsonb_each(epv.forms_properties) f(form_key, form_value)
            CROSS JOIN LATERAL jsonb_each_text(f.form_value -> 'field_error_count') AS fe(field_key, field_value)
            WHERE f.form_value -> 'field_error_count' IS NOT NULL
              AND jsonb_typeof(f.form_value -> 'field_error_count') = 'object'
        ) all_field_errors
    ) AS form_errors_detail,
    -- Hero scroll engagement
    COALESCE(
        (
            SELECT bool_or(COALESCE((e.value ->> 'viewed')::boolean, false))
            FROM jsonb_each(epv.page_elements) e(key, value)
            WHERE e.key ILIKE '%hero%'
        ),
        false
    ) AS hero_scroll_passed,
    epv.page_elements
FROM
    public.event_page_view epv
LEFT JOIN
    public.session s
    ON epv.ff_visitor_id = s.ff_visitor_id
    AND epv.session_id = s.session_id;

-- VERIFICATION QUERIES

-- Check total counts
SELECT
    COUNT(*) as total_rows,
    COUNT(CASE WHEN form_errors > 0 THEN 1 END) as rows_with_errors,
    COUNT(CASE WHEN form_errors_detail IS NOT NULL THEN 1 END) as rows_with_error_details,
    SUM(form_errors) as total_errors
FROM public.event_page_view_enriched;

-- Show sample records with form errors
SELECT
    id,
    created_at::date as date,
    form_errors,
    jsonb_pretty(form_errors_detail) as error_details
FROM public.event_page_view_enriched
WHERE form_errors > 0
ORDER BY created_at DESC
LIMIT 5;

-- ROLLBACK INSTRUCTIONS (if needed)
-- To rollback, you would need the original view definition
