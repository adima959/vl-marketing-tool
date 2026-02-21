# On-Page Data — Column Reference

**Approach**: Single query builder (`lib/server/trackerQueryBuilder.ts`) builds JOINs inline from raw `tracker_*` tables. No database views.

## Data Sources

| Query Mode | Source Tables | Granularity | Used by |
|------------|-------------|-------------|---------|
| **entry** (CTE: `DISTINCT ON (session_id)`) | tracker_page_views + tracker_sessions + tracker_events + tracker_raw_heartbeats | One row per session | `getTrackerDataFlat()` (entry dims), `getTrackerMetricsByCampaign()` |
| **all-pv** | Same tables, no CTE | One row per page view | `getTrackerDataFlat()` (page-level dims), `getTrackerDetail()` |
| **funnel** | All PVs for sessions matching funnel criteria | One row per page view | `getTrackerDataFlat()` (funnelStep dim) |

Ad name resolution via `LEFT JOIN marketing_merged_ads_spending` (on-demand, when enriched dims like campaign/adset/ad are requested).

### Enrichment logic
- UTM, device, geo, timezone, language → from `tracker_sessions`
- `ff_visitor_id` → `tracker_sessions.visitor_id`
- `visit_number` → `DENSE_RANK() OVER (PARTITION BY visitor_id ORDER BY created_at)`
- `local_hour_of_day` → `EXTRACT(HOUR FROM viewed_at AT TIME ZONE timezone)`
- `active_time_s` → `time_on_page_final_ms / 1000` with heartbeat fallback
- `scroll_percent` → MAX `page_scroll` event `scroll_percent` property
- `hero_scroll_passed` → `element_signal` with `signal_id IN ('hero-section','hero')` + `action = 'out_view'`
- `form_view` → `form` event + `action = 'visible'`
- `form_started` → `form` event + `action = 'started'`
- `cta_viewed` → `element_signal` with `signal_id LIKE 'CTA-%'` + `action = 'in_view'`
- `cta_clicked` → `element_signal` with `signal_id LIKE 'CTA-%'` + `action = 'click'`
- Performance (fcp_s, lcp_s, etc.) → `tracker_page_views.*_ms / 1000`

---

## Entry mode — Session-level columns

| Column | Type | Notes |
|--------|------|-------|
| `session_id` | uuid | PK |
| `ff_visitor_id` | text | Visitor identifier |
| `session_start` | timestamp | Session creation time |
| `entry_url_path` | text | First page visited |
| `entry_page_type` | varchar | Page type of entry page |
| `entry_utm_source` | varchar | UTM source |
| `entry_utm_campaign` | varchar | Raw campaign ID |
| `entry_utm_content` | varchar | Raw adset ID |
| `entry_utm_medium` | varchar | Raw ad ID / webmaster ID |
| `entry_utm_term` | varchar | UTM term |
| `entry_keyword` | varchar | Keyword |
| `entry_placement` | varchar | Placement |
| `entry_referrer` | text | Referrer URL |
| `ff_funnel_id` | varchar | FunnelFlux funnel ID |
| `entry_country_code` | varchar | Country |
| `entry_device_type` | varchar | Device type |
| `entry_os_name` | varchar | OS name |
| `entry_browser_name` | varchar | Browser name |
| `visit_number` | int | Nth visit by this visitor |
| `entry_active_time_s` | numeric | Time on entry page (seconds) |
| `entry_hero_scroll_passed` | bool | Scrolled past hero on entry |
| `entry_form_view` | bool | Saw form on entry |
| `entry_form_started` | bool | Started form on entry |

## All-PV / Detail mode — Page view columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `session_id` | uuid | FK to session |
| `ff_visitor_id` | text | Visitor identifier |
| `created_at` | timestamp | Page view timestamp |
| `url_path` | text | Page URL path |
| `url_full` | text | Full URL |
| `page_type` | varchar | Page type |
| `utm_source` | varchar | UTM source (session-level) |
| `utm_campaign` | varchar | Raw campaign ID |
| `utm_content` | varchar | Raw adset ID |
| `utm_medium` | varchar | Raw ad ID |
| `utm_term` | varchar | UTM term |
| `keyword` | varchar | Keyword |
| `placement` | varchar | Placement |
| `referrer` | text | Referrer |
| `ff_funnel_id` | varchar | FunnelFlux funnel ID |
| `device_type` | varchar | Device type |
| `country_code` | varchar | Country |
| `os_name` | varchar | OS |
| `browser_name` | varchar | Browser |
| `timezone` | varchar | Visitor timezone |
| `language` | varchar | Browser language |
| `visit_number` | int | Nth visit |
| `local_hour_of_day` | int | Hour in visitor's timezone |
| `active_time_s` | numeric | Time on page (seconds) |
| `scroll_percent` | int | Max scroll depth |
| `hero_scroll_passed` | bool | Scrolled past hero |
| `form_view` | bool | Form became visible |
| `form_started` | bool | Started filling form |
| `cta_viewed` | bool | CTA in viewport |
| `cta_clicked` | bool | CTA clicked |
| `fcp_s` | numeric | First Contentful Paint |
| `lcp_s` | numeric | Largest Contentful Paint |
| `tti_s` | numeric | Time to Interactive |
| `dcl_s` | numeric | DOM Content Loaded |
| `load_s` | numeric | Full page load |
| `form_errors` | int | Count of form error events |
| `form_errors_detail` | jsonb | Form error details |

---

## Dimension Groups (UI menu)

| Group | Color | Dimensions |
|-------|-------|-----------|
| **Page** | Blue `#3b82f6` | Entry URL, Page Type |
| **Acquisition** | Orange `#f59e0b` | Source, Campaign, Ad Set, Ad |
| **Traffic** | Amber `#d97706` | UTM Term, Keyword, Placement, Referrer, FF Funnel ID |
| **Audience** | Purple `#8b5cf6` | Country, Device, OS, Browser, Visit Number |
| **Funnel** | Red `#ef4444` | Funnel Steps |
| **Time** | Green `#10b981` | Date |
