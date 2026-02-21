# Unified TrackerQueryBuilder — Replace Views with Code

## Context

Currently, on-page analytics uses two DB views (`tracker_page_views_enriched`, `tracker_session_entries`) and three separate query paths (`sessionQueryBuilder`, `onPageQueryBuilder`, on-page functions in `campaignPerformance`). The user wants:

1. **No database views** — JOINs live in code, not DB
2. **Single source of truth** — one query builder for all tracker queries, so changing a calculation reflects app-wide
3. **Flat results** — server returns flat rows with dimension values + metric counts; frontend handles trees/calculations
4. **Follows the established pattern** — same style as `marketingQueryBuilder.ts`

## Step 1: Drop database views

Run SQL to drop both views from neondb:
```sql
DROP VIEW IF EXISTS tracker_page_views_enriched;
DROP VIEW IF EXISTS tracker_session_entries;
```

Delete view-creation scripts:
- `scripts/create-tracker-views.ts`
- `scripts/migrations/create-tracker-views.sql`

## Step 2: Create `lib/server/trackerQueryBuilder.ts`

A single file that exports one flat query function + one detail query function, both building SQL from the raw `tracker_*` tables inline.

### Base FROM clause (shared)

Every query starts from the same JOIN chain:

```sql
FROM tracker_page_views pv
JOIN tracker_sessions s ON pv.session_id = s.session_id
LEFT JOIN LATERAL (
  SELECT MAX(cumulative_active_ms) AS cumulative_active_ms
  FROM tracker_raw_heartbeats hb
  WHERE hb.page_view_id = pv.page_view_id
) hb ON true
LEFT JOIN LATERAL (
  SELECT
    MAX((e.event_properties->>'scroll_percent')::int)
      FILTER (WHERE e.event_name = 'page_scroll') AS scroll_percent,
    bool_or(e.event_name = 'element_signal' AND e.signal_id IN ('hero-section','hero') AND e.action = 'out_view') AS hero_scroll_passed,
    bool_or(e.event_name = 'form' AND e.action = 'visible') AS form_view,
    bool_or(e.event_name = 'form' AND e.action = 'started') AS form_started,
    bool_or(e.event_name = 'element_signal' AND e.signal_id LIKE 'CTA-%' AND e.action = 'in_view') AS cta_viewed,
    bool_or(e.event_name = 'element_signal' AND e.signal_id LIKE 'CTA-%' AND e.action = 'click') AS cta_clicked,
    COUNT(*) FILTER (WHERE e.event_name = 'form' AND e.action = 'errors') AS form_errors,
    (array_agg(e.event_properties) FILTER (WHERE e.event_name = 'form' AND e.action = 'errors'))[1] AS form_errors_detail
  FROM tracker_events e
  WHERE e.page_view_id = pv.page_view_id
) ev ON true
```

For **session-entry mode**, wrap in a CTE that picks first page view per session:
```sql
WITH entry_pv AS (
  SELECT DISTINCT ON (session_id) *
  FROM tracker_page_views
  ORDER BY session_id, viewed_at ASC
)
-- then same JOINs but from entry_pv instead of tracker_page_views
```

Optional LEFT JOIN to `marketing_merged_ads_spending` when campaign/adset/ad dimensions or filters are used (for display name resolution).

### Dimension maps

Single `DIMENSION_MAP` — maps frontend dimension IDs to SQL expressions:

| Dimension ID | SQL expression | Mode |
|---|---|---|
| `entryUrlPath` | `pv.url_path` | entry |
| `entryPageType` | `pv.page_type` | entry |
| `urlPath` | `pv.url_path` | all-pv |
| `pageType` | `pv.page_type` | all-pv |
| `entryUtmSource` / `utmSource` | `s.utm_source` | both |
| `entryCampaign` / `campaign` | `s.utm_campaign` | both (enriched) |
| `entryAdset` / `adset` | `s.utm_content` | both (enriched) |
| `entryAd` / `ad` | `s.utm_medium` | both (enriched) |
| `entryUtmTerm` | `s.utm_term` | entry |
| `entryKeyword` | `s.keyword` | entry |
| `entryPlacement` | `s.placement` | entry |
| `entryReferrer` | `s.refferer` | entry |
| `funnelId` | `s.ff_funnel_id` | both |
| `entryCountryCode` | `s.country_code` | entry |
| `entryDeviceType` | `s.device_type` | entry |
| `entryOsName` | `s.os_name` | entry |
| `entryBrowserName` | `s.browser_name` | entry |
| `visitNumber` | `DENSE_RANK() OVER (PARTITION BY s.visitor_id ORDER BY s.created_at)` | both (computed) |
| `date` | `pv.viewed_at::date` (all-pv) or `s.created_at::date` (entry) | both |
| `funnelStep` | triggers funnel-mode (all page views for matching sessions) | funnel |

Enriched dims (`campaign`, `adset`, `ad`) emit two columns: raw ID + display name via LEFT JOIN `marketing_merged_ads_spending`.

### Exported functions

#### `getTrackerDataFlat(params): Promise<FlatRow[]>`

Replaces `sessionQueryBuilder.buildFlatQuery()` — used by the sessions/query API.

```ts
interface TrackerFlatParams {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  filters?: Array<{ field: string; operator: FilterOperator; value: string }>;
}
```

**Logic:**
1. Determine mode from dimensions: `entry` (entry_* dims only → CTE with DISTINCT ON), `funnel` (funnelStep present → all PVs for matching sessions), or `all-pv` (page-level dims)
2. Build SELECT: dimension columns + metric aggregates
3. Build FROM: base JOIN chain (with entry CTE if needed)
4. Build WHERE: date range + filters (same parameterized pattern as marketingQueryBuilder)
5. Build GROUP BY: all dimension columns
6. Execute and return normalized rows

**Metrics** (always included as aggregates):
- `page_views`: `COUNT(*)`
- `unique_visitors`: `COUNT(DISTINCT s.visitor_id)`
- `bounced_count`: `COUNT(*) FILTER (WHERE active_time_s < 5 AND active_time_s IS NOT NULL)`
- `active_time_count`: `COUNT(*) FILTER (WHERE active_time_s IS NOT NULL)`
- `total_active_time`: `SUM(active_time_s)`
- `scroll_past_hero`: `COUNT(*) FILTER (WHERE ev.hero_scroll_passed = true)`
- `form_views`: `COUNT(*) FILTER (WHERE ev.form_view = true)`
- `form_starters`: `COUNT(*) FILTER (WHERE ev.form_started = true)`

#### `getTrackerDetail(params): Promise<{ records: Row[]; total: number }>`

Replaces `onPageQueryBuilder.buildDetailQuery()` — used by the detail API.

```ts
interface TrackerDetailParams {
  dateRange: { start: Date; end: Date };
  dimensionFilters: Record<string, string>;
  metricId?: string;
  page: number;
  pageSize: number;
}
```

**Logic:**
1. Build FROM with all JOINs (always full — detail needs all columns)
2. Build WHERE from dimensionFilters + date range
3. Handle entry-level filters: if entry_* dims present, add `session_id IN (subquery)` using the entry CTE
4. Handle classification filters (`classifiedProduct`, `classifiedCountry`) via `app_url_classifications` subquery
5. Handle `uniqueVisitors` metricId: `DISTINCT ON (s.visitor_id)` + wrap in count subquery
6. Pagination: `LIMIT/OFFSET`
7. Return both data query + count query results

#### `getTrackerMetricsByCampaign(params): Promise<Map<string, OnPageMetrics>>`

Replaces `fetchOnPageMetrics()` in `campaignPerformance.ts`.

```ts
interface TrackerCampaignParams {
  externalIds: string[];
  dateRange: { start: Date; end: Date };
}
```

**Logic:**
- Same base JOIN chain
- GROUP BY `s.utm_campaign`
- WHERE `s.utm_campaign = ANY($3)` + date range
- Returns: page_views, unique_visitors, form_views, form_starters, bounce_rate, scroll_past_hero, avg_time_on_page per campaign

Also export helpers for:
- `getTrackerAdsetMetrics(campaignId, dateRange)` — GROUP BY utm_content (adset)
- `getTrackerAdLandingPages(campaignId, dateRange)` — GROUP BY utm_medium, url_path
- `getTrackerFunnelFluxIds(campaignId, dateRange)` — DISTINCT ff_funnel_id

### Internal helpers (not exported)

- `buildBaseFrom(mode: 'entry' | 'all-pv')` — returns the FROM clause string
- `buildFilterClause(filters, paramOffset)` — returns `{ clause, params }` with AND conditions
- `computedColumns(dimensions)` — returns SELECT expressions for computed dims like visit_number
- `needsMarketingJoin(dimensions, filters)` — returns boolean for enriched dim JOIN

## Step 3: Update API routes

### `app/api/on-page-analysis/sessions/query/route.ts`
- Change import from `sessionQueryBuilder` → `getTrackerDataFlat` from `trackerQueryBuilder`
- Call `getTrackerDataFlat(params)` directly (it returns rows, not {query, params})
- Remove manual `executeQuery` — the function handles it internally

### `app/api/on-page-analysis/detail/route.ts`
- Change import from `onPageQueryBuilder` → `getTrackerDetail` from `trackerQueryBuilder`
- Call `getTrackerDetail(params)` — returns `{ records, total }`

### `app/api/on-page-analysis/url-classifications/route.ts`
- Change `tracker_page_views_enriched` → just query `SELECT DISTINCT url_path FROM tracker_page_views` — no JOIN needed for URL list

### `app/api/marketing-pipeline/campaigns/performance/route.ts` (no change)
- This route calls `getCampaignPerformance()` which calls internal functions

### `lib/marketing-pipeline/campaignPerformance.ts`
- Replace `fetchOnPageMetrics()` → call `getTrackerMetricsByCampaign()` from trackerQueryBuilder
- Replace `fetchAdLandingPages()` → call `getTrackerAdLandingPages()`
- Replace `fetchFunnelFluxIds()` → call `getTrackerFunnelFluxIds()`
- Keep the ads + CRM fetch functions unchanged

## Step 4: Delete old files

- `lib/server/sessionQueryBuilder.ts` — fully replaced
- `lib/server/onPageQueryBuilder.ts` — fully replaced
- `scripts/create-tracker-views.ts` — views no longer needed
- `scripts/migrations/create-tracker-views.sql` — views no longer needed

## Step 5: Update docs & rules

- `CLAUDE.md` — remove mention of `tracker_page_views_enriched` / `tracker_session_entries` views from the on-page analytics rule. Update to reference `trackerQueryBuilder.ts`
- `docs/plans/2026-02-21-on-page-joined-view-columns.md` — update to reflect code-based approach, keep column reference

## Step 6: Drop views from database

Run a script to:
```sql
DROP VIEW IF EXISTS tracker_page_views_enriched;
DROP VIEW IF EXISTS tracker_session_entries;
```

## Files Summary

| Action | File |
|--------|------|
| **Create** | `lib/server/trackerQueryBuilder.ts` |
| **Modify** | `app/api/on-page-analysis/sessions/query/route.ts` |
| **Modify** | `app/api/on-page-analysis/detail/route.ts` |
| **Modify** | `app/api/on-page-analysis/url-classifications/route.ts` |
| **Modify** | `lib/marketing-pipeline/campaignPerformance.ts` |
| **Modify** | `.claude/CLAUDE.md` |
| **Modify** | `docs/plans/2026-02-21-on-page-joined-view-columns.md` |
| **Delete** | `lib/server/sessionQueryBuilder.ts` |
| **Delete** | `lib/server/onPageQueryBuilder.ts` |
| **Delete** | `scripts/create-tracker-views.ts` |
| **Delete** | `scripts/migrations/create-tracker-views.sql` |

## Verification

1. `npm run build` — type check passes
2. Run drop-views script against neondb
3. `npm run dev` → test on-page analysis sessions page (load data with various dimensions/filters)
4. Test on-page detail page (pagination, unique visitors, classification filters)
5. Test marketing pipeline campaigns (performance metrics should still populate)
