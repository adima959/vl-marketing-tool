-- Migration: Fix only the form_errors_detail extraction logic
-- Changes field_error_count object to proper array format
-- Example: {"email": 2, "gov_id": 12} becomes [{"field": "email", "error_count": 2}, {"field": "gov_id", "error_count": 12}]

DROP VIEW IF EXISTS public.event_page_view_enriched CASCADE;

CREATE OR REPLACE VIEW public.event_page_view_enriched AS
SELECT
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
    epv.url_path,
    epv.url_full,
    epv.page_type,
    epv.utm_source,
    epv.utm_campaign,
    epv.utm_content,
    epv.utm_medium,
    epv.utm_term,
    NULLIF((regexp_match(epv.url_full, '[?&]keyword=([^&]*)'::text, 'i'::text))[1], ''::text) AS keyword,
    NULLIF(regexp_replace((regexp_match(epv.url_full, '[?&]placement=([^&]*)'::text, 'i'::text))[1], '%3A%3A'::text, '::'::text, 'gi'::text), ''::text) AS placement,
    epv.ip,
    epv.visit_number,
    epv.user_agent,
    epv.device_type,
    epv.os_name,
    epv.browser_name,
    (epv.properties -> 'client_info'::text) ->> 'language'::text AS language,
    (epv.properties -> 'client_info'::text) ->> 'platform'::text AS platform,
    ((epv.properties -> 'client_info'::text) -> 'os'::text) ->> 'version'::text AS os_version,
    epv.country_code,
    epv.timezone,
    epv.screen_width,
    epv.screen_height,
    round(epv.fcp_ms::numeric / 1000.0, 2) AS fcp_s,
    round(epv.lcp_ms::numeric / 1000.0, 2) AS lcp_s,
    round(epv.tti_ms::numeric / 1000.0, 2) AS tti_s,
    round(epv.dcl_ms::numeric / 1000.0, 2) AS dcl_s,
    round(epv.load_ms::numeric / 1000.0, 2) AS load_s,
    round(EXTRACT(epoch FROM LEAST(COALESCE(epv.page_leave_at::timestamp with time zone, 'infinity'::timestamp with time zone), GREATEST(epv.created_at, COALESCE(eps.max_scroll_at, epv.created_at), COALESCE(epsig.max_signal_at, epv.created_at), COALESCE(ef.max_form_at, epv.created_at))::timestamp with time zone) - epv.created_at::timestamp with time zone), 2) AS active_time_s,
    eps.max_scroll_percent AS scroll_percent,
    COALESCE(( SELECT bool_or(COALESCE((f.value ->> 'viewed'::text)::boolean, false)) AS bool_or
           FROM jsonb_each(epv.forms_properties) f(key, value)), false) AS form_view,
    COALESCE(( SELECT sum(COALESCE((f.value ->> 'error_count'::text)::integer, 0)) AS sum
           FROM jsonb_each(epv.forms_properties) f(key, value)), 0::bigint) AS form_errors,
    -- FIXED: Extract field_error_count object and convert to array
    ( SELECT jsonb_agg(
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
          AND jsonb_typeof(f.form_value -> 'field_error_count') = 'object'::text
      ) all_field_errors
    ) AS form_errors_detail,
    COALESCE(( SELECT bool_or(COALESCE((f.value ->> 'started'::text)::boolean, false)) AS bool_or
           FROM jsonb_each(epv.forms_properties) f(key, value)), false) AS form_started,
    COALESCE(( SELECT bool_or(COALESCE((e.value ->> 'scrolled_past'::text)::boolean, false)) AS bool_or
           FROM jsonb_each(epv.page_elements_properties) e(key, value)
          WHERE COALESCE(e.value ->> 'signal_id'::text, ''::text) ~~* 'hero%'::text), false) AS hero_scroll_passed,
    COALESCE(( SELECT bool_or(COALESCE((e.value ->> 'viewed'::text)::boolean, false)) AS bool_or
           FROM jsonb_each(epv.page_elements_properties) e(key, value)
          WHERE COALESCE(e.value ->> 'signal_id'::text, ''::text) ~~* 'CTA%'::text), false) AS cta_viewed,
    COALESCE(( SELECT bool_or(COALESCE((e.value ->> 'clicked'::text)::boolean, false)) AS bool_or
           FROM jsonb_each(epv.page_elements_properties) e(key, value)
          WHERE COALESCE(e.value ->> 'signal_id'::text, ''::text) ~~* 'CTA%'::text), false) AS cta_clicked,
    (epv.properties -> 'client_info'::text) ->> 'referrer'::text AS referrer,
    epv.forms_properties AS forms,
    epv.page_elements_properties AS page_elements
FROM event_page_view epv
LEFT JOIN ( SELECT event_page_scroll.page_load_id,
        max(event_page_scroll.created_at) AS max_scroll_at,
        max(event_page_scroll.depth) AS max_scroll_percent
       FROM event_page_scroll
      GROUP BY event_page_scroll.page_load_id) eps ON eps.page_load_id = epv.page_load_id
LEFT JOIN ( SELECT event_element_signal.page_load_id,
        max(event_element_signal.created_at) AS max_signal_at
       FROM event_element_signal
      GROUP BY event_element_signal.page_load_id) epsig ON epsig.page_load_id = epv.page_load_id
LEFT JOIN ( SELECT event_form.page_load_id,
        max(event_form.created_at) AS max_form_at
       FROM event_form
      GROUP BY event_form.page_load_id) ef ON ef.page_load_id = epv.page_load_id;

-- VERIFICATION
SELECT
    COUNT(*) as total_rows,
    COUNT(CASE WHEN form_errors > 0 THEN 1 END) as rows_with_errors,
    COUNT(CASE WHEN form_errors_detail IS NOT NULL THEN 1 END) as rows_with_details,
    SUM(form_errors) as total_errors
FROM public.event_page_view_enriched;

-- Show samples
SELECT
    id,
    created_at::date as date,
    form_errors,
    jsonb_pretty(form_errors_detail) as error_details
FROM public.event_page_view_enriched
WHERE form_errors > 0
ORDER BY created_at DESC
LIMIT 3;
