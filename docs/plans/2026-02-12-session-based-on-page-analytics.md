# Session-Based On-Page Analytics Rebuild

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild On-Page Analytics to group page views by session, showing entry pages at the top level with funnel progression metrics, instead of the current flat page-view-level aggregation.

**Architecture:** Create a new PostgreSQL materialized view (`session_entries`) that pre-computes one row per session with entry page, funnel flags, and session-level metrics. Build a new query builder and API endpoint that queries this view for the top-level table, and drills down to individual page views within sessions for sub-levels.

**Tech Stack:** PostgreSQL (Neon), Next.js API routes, TypeScript, Zustand

**CRM Integration:** Deferred to Phase II. The current CRM matching approach is documented in Appendix D for future reference.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Definitions & Rules](#2-definitions--rules)
3. [Current State Analysis](#3-current-state-analysis)
4. [Target Architecture](#4-target-architecture)
5. [Open Questions (Require Data Exploration)](#5-open-questions)
6. [Implementation Plan](#6-implementation-plan)

---

## 1. Problem Statement

### What's Wrong Today

The current On-Page Analytics page treats every page view as an independent event. When you look at the table, you see:

| URL Path | Page Views | Visitors | Bounce Rate | ... |
|----------|-----------|----------|-------------|-----|
| /no/product-a | 12,450 | 8,200 | 42% | ... |
| /no/checkout | 3,100 | 2,800 | 15% | ... |
| /no/thankyou | 1,200 | 1,100 | 5% | ... |
| /no/upsell | 900 | 850 | 8% | ... |

**Problems:**
1. **Mixed levels**: Landing pages, checkout pages, thank-you pages all shown at the same level
2. **No funnel visibility**: Can't see "of people who landed on /product-a, how many reached checkout? Thank you?"
3. **Inflated metrics**: A checkout page showing 3,100 views doesn't mean 3,100 new sessions - these are people who came through various entry points
4. **No session context**: Can't answer "what was the user journey?" because pages aren't linked

### What We Want

**Level 1 (Entry Pages):**

| Entry Page | Sessions | Visitors | Reached Checkout | Reached Thank You | Conv. Rate | ... |
|-----------|----------|----------|-----------------|-------------------|------------|-----|
| /no/product-a | 8,200 | 6,500 | 38% | 14% | 8.2% | ... |
| /se/product-b | 4,100 | 3,200 | 41% | 16% | 9.1% | ... |

**Level 2 (Expand /no/product-a):**

| Page in Funnel | Sessions Reached | Drop-off % | Avg Time | ... |
|---------------|-----------------|------------|----------|-----|
| /no/product-a (entry) | 8,200 | - | 45s | ... |
| /no/checkout | 3,116 | 62% | 32s | ... |
| /no/thankyou | 1,148 | 86% | 5s | ... |

---

## 2. Definitions & Rules

### 2.1 Session

**Definition:** A session is a group of page views sharing the same `session_id` value in the `event_page_view_enriched_v2` materialized view.

**Source:** The `session_id` is assigned by the FingerFront tracking client. It represents a continuous browsing period. Sessions end when the browser is closed or after an inactivity timeout (typically 30 minutes).

**Rule:** We use `session_id` as-is from the tracking system. We do NOT redefine session boundaries.

### 2.2 Entry Page (Landing Page)

**Definition:** The entry page is the **first page view** within a session, determined by the earliest `created_at` timestamp.

**SQL Rule:**
```sql
-- For each session, the entry page is:
FIRST_VALUE(url_path) OVER (
  PARTITION BY session_id
  ORDER BY created_at ASC
) AS entry_url_path
```

**Tie-breaking:** If two page views in the same session have identical `created_at` timestamps, use the row `id` (ascending) as tiebreaker. This should be extremely rare.

**Important:** The entry page is NOT necessarily a "landing page" by design. A user could directly navigate to `/checkout` as their first page. We still treat `/checkout` as the entry page for that session.

### 2.3 Subsequent Page Views

**Definition:** All page views in a session that are NOT the entry page. They are linked to the entry page via `session_id`.

**Rule:** Subsequent page views are NEVER shown at the top level. They only appear when drilling down into a specific entry page.

### 2.4 Session Metrics (Level 1)

| Metric | Definition | SQL |
|--------|-----------|-----|
| Sessions | Count of distinct `session_id` values | `COUNT(DISTINCT session_id)` |
| Unique Visitors | Count of distinct `ff_visitor_id` values | `COUNT(DISTINCT ff_visitor_id)` |
| Avg Pages/Session | Average page views per session | `AVG(total_page_views)` |
| Bounce Rate | Sessions with only 1 page view | `SUM(CASE WHEN total_page_views = 1 THEN 1 ELSE 0 END) / COUNT(*)` |
| Avg Entry Time | Average active time on the entry page | `AVG(entry_active_time_s)` |
| Reached PDP % | Sessions where any page has `page_type IN ('pdp', 'pdp-order-form')` | `SUM(reached_pdp::int) / COUNT(*)` |
| Reached Order % | Sessions where any page has `page_type = 'order-page'` or URL matches `/order/` | `SUM(reached_order::int) / COUNT(*)` |
| Reached X-sell % | Sessions where any page has `page_type = 'xsell'` | `SUM(reached_xsell::int) / COUNT(*)` |
| Reached Thank You % | Sessions where any page has `page_type = 'thank-you'` or URL matches `/thankyou/` | `SUM(reached_thankyou::int) / COUNT(*)` |

### 2.5 Funnel Stage Classification

**OPEN QUESTION:** How do we classify pages into funnel stages? Two options:

**Option A: Use `page_type` field**
The tracking system already sets a `page_type` field. We need to validate what values exist and whether they reliably map to funnel stages. Expected values: `landing`, `product`, `checkout`, `thankyou`, `upsell`, etc.

**Option B: URL pattern matching**
Define regex rules that classify URLs into funnel stages:
```
/*/checkout* → checkout
/*/thankyou* → thankyou
/*/upsell*   → upsell
/*/order*    → order
everything else → landing/content
```

**Option C: Hybrid**
Use `page_type` when available, fall back to URL pattern matching.

**Decision needed before implementation.** Phase 1 data exploration will inform this.

### 2.6 CRM Attribution at Session Level

**Rule:** CRM conversions (trials, approvals) are attributed to the **entry page** of the session. Rationale: the entry page is what brought the user in.

**Matching strategy:**
1. Get `ff_visitor_id` values for sessions with a given entry page
2. Match against `ff_vid` in `crm_subscription_enriched` (MariaDB)
3. Each CRM conversion is attributed to ONE entry page (the entry page of the session where the visitor first appeared in the date range)

**De-duplication rule:** If a visitor has multiple sessions in the date range, the CRM conversion is attributed to the **first session's entry page** (earliest `session_start`). This prevents double-counting.

### 2.7 Date Range Filtering

**Rule:** Filter by `session_start` (the entry page's `created_at`), NOT by individual page view timestamps. A session that starts on Jan 31 and has page views on Feb 1 should appear in the Jan 31 report, not Feb 1.

---

## 3. Current State Analysis

### 3.1 Data Sources

| Database | Table | Type | Rows (est.) | Purpose |
|----------|-------|------|-------------|---------|
| PostgreSQL (Neon) | `remote_session_tracker.event_page_view_enriched_v2` | Materialized View | Millions | Every page view with 60 columns |
| MariaDB | `crm_subscription_enriched` | Table | Tens of thousands | Pre-computed trial subscriptions |
| PostgreSQL (Neon) | `app_url_classifications` | Table | Hundreds | URL → Product/Country mapping |
| PostgreSQL (Neon) | `merged_ads_spending` | Table | Thousands | Campaign/adset/ad name lookups |

### 3.2 Key Fields Available for Session Grouping

From `event_page_view_enriched_v2`:

| Field | Type | Description | Populated? |
|-------|------|-------------|-----------|
| `session_id` | UUID | Session identifier from tracker | **Needs validation** |
| `ff_visitor_id` | VARCHAR | Persistent visitor ID (fingerprint) | Present on most rows |
| `visit_number` | INT | Nth visit for this visitor | From session table JOIN |
| `created_at` | TIMESTAMP | When the page view was recorded | Always present |
| `url_path` | VARCHAR | Normalized URL path (no query/hash) | Always present |
| `page_type` | VARCHAR | Page classification | **Needs validation** |
| `active_time_s` | NUMERIC | Active time on page (seconds) | Present, may be 0 |

### 3.3 Current Query Architecture (will be replaced)

```
POST /api/on-page-analysis/query
  → onPageQueryBuilder.buildQuery()          -- PG: GROUP BY dimension, COUNT(*)
  → onPageCrmQueries.getOnPageCRM*()         -- MariaDB: trials/approved
  → onPageTransforms.build*CrmMatch()        -- Application: cross-DB join
  → Return flat rows
```

**Files involved:**
- `lib/server/onPageQueryBuilder.ts` (780 lines) — PG query builder
- `lib/server/onPageCrmQueries.ts` (189 lines) — MariaDB CRM queries
- `lib/server/onPageTransforms.ts` — CRM matching logic
- `app/api/on-page-analysis/query/route.ts` (342 lines) — API orchestration
- `app/on-page-analysis/page.tsx` — Frontend page
- `config/onPageColumns.ts` — Metric definitions
- `config/onPageDimensions.ts` — Dimension definitions
- `stores/onPageStore.ts` — Zustand state
- `components/on-page-analysis/` — Table, modals, columns

### 3.4 Current Metrics (will be restructured)

**Engagement:** pageViews, uniqueVisitors, bounceRate, avgActiveTime
**Interactions:** scrollPastHero, scrollRate, formViews, formViewRate, formStarters, formStartRate
**CRM:** crmConvRate, crmTrials, crmApproved, crmApprovalRate

---

## 4. Target Architecture

### 4.1 New Materialized View: `session_entries`

**Database:** PostgreSQL (Neon), schema `remote_session_tracker`

**Purpose:** One row per session, pre-computed from `event_page_view_enriched_v2`

**Refresh:** Manual via script (same pattern as `event_page_view_enriched_v2`)

**Schema:**
```sql
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
  ff_visitor_id,

  -- Entry page info (from page_seq = 1)
  MAX(url_path)     FILTER (WHERE page_seq = 1) AS entry_url_path,
  MAX(url_full)     FILTER (WHERE page_seq = 1) AS entry_url_full,
  MAX(page_type)    FILTER (WHERE page_seq = 1) AS entry_page_type,
  MIN(created_at)   AS session_start,
  MAX(created_at)   AS session_end,

  -- Entry page UTM (for CRM matching and dimension grouping)
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
  MAX(active_time_s)       FILTER (WHERE page_seq = 1) AS entry_active_time_s,
  MAX(scroll_percent)      FILTER (WHERE page_seq = 1) AS entry_scroll_percent,
  MAX(hero_scroll_passed)  FILTER (WHERE page_seq = 1) AS entry_hero_scroll_passed,
  MAX(form_view::int)      FILTER (WHERE page_seq = 1) AS entry_form_view,
  MAX(form_started::int)   FILTER (WHERE page_seq = 1) AS entry_form_started,
  MAX(cta_viewed::int)     FILTER (WHERE page_seq = 1) AS entry_cta_viewed,
  MAX(cta_clicked::int)    FILTER (WHERE page_seq = 1) AS entry_cta_clicked,

  -- Session-level metrics
  COUNT(*) AS total_page_views,
  COUNT(DISTINCT url_path) AS unique_pages_visited,
  SUM(active_time_s) AS total_active_time_s,

  -- Funnel progression flags (validated via Q3+Q6 exploration)
  BOOL_OR(page_type = 'pdp' OR page_type = 'pdp-order-form') AS reached_pdp,
  BOOL_OR(page_type = 'order-page' OR (page_type IS NULL AND url_path LIKE '%/order/%')) AS reached_order,
  BOOL_OR(page_type = 'xsell') AS reached_xsell,
  BOOL_OR(page_type = 'thank-you' OR (page_type IS NULL AND url_path LIKE '%/thankyou/%')) AS reached_thankyou

FROM ordered_views
GROUP BY session_id, ff_visitor_id;
```

**Indexes:**
```sql
CREATE INDEX idx_se_entry_url ON remote_session_tracker.session_entries (entry_url_path);
CREATE INDEX idx_se_session_start ON remote_session_tracker.session_entries (session_start);
CREATE INDEX idx_se_visitor ON remote_session_tracker.session_entries (ff_visitor_id);
CREATE INDEX idx_se_utm_source ON remote_session_tracker.session_entries (entry_utm_source, session_start);
CREATE INDEX idx_se_country ON remote_session_tracker.session_entries (entry_country_code, session_start);
CREATE INDEX idx_se_device ON remote_session_tracker.session_entries (entry_device_type, session_start);
```

### 4.2 New Query Flow

```
POST /api/on-page-analysis/sessions/query
  ↓
  Level 1: Query session_entries (GROUP BY entry_url_path or other dimension)
    → Sessions, Visitors, Funnel %, CRM metrics
  ↓
  Level 2: Query event_page_view_enriched_v2 WHERE session_id IN (sessions from level 1)
    → Pages within those sessions, ordered by page_seq
```

### 4.3 File Changes Overview

| Action | File | Description |
|--------|------|-------------|
| **Create** | `scripts/migrations/session-entries-view.sql` | Materialized view DDL |
| **Create** | `scripts/refresh-session-entries.ts` | Refresh script |
| **Create** | `lib/server/sessionQueryBuilder.ts` | New query builder for session-level queries |
| **Create** | `app/api/on-page-analysis/sessions/query/route.ts` | New API endpoint |
| **Create** | `app/api/on-page-analysis/sessions/drill-down/route.ts` | Drill-down into session pages |
| **Create** | `config/sessionColumns.ts` | New metric column definitions |
| **Create** | `config/sessionDimensions.ts` | New dimension definitions |
| **Modify** | `app/on-page-analysis/page.tsx` | Toggle between session view and legacy view (or replace entirely) |
| **Modify** | `config/onPageColumns.ts` | Add funnel metrics |
| Keep | `lib/server/onPageQueryBuilder.ts` | Keep for drill-down detail queries |
| Keep | `components/on-page-analysis/OnPageViewsModal.tsx` | Keep for page-view detail modal |

---

## 5. Open Questions — ANSWERED (2026-02-12)

All questions answered via `scripts/explore-session-data.ts`. Data from Jan-Feb 2026 (276K page views).

### Q1: session_id Coverage
**ANSWER: 100% coverage.** All 276,386 page views have session_id. No fallback needed.
No null handling required in the materialized view WHERE clause (kept `WHERE session_id IS NOT NULL` as safety net).

### Q2: Session Size Distribution
**ANSWER:** 209,931 total sessions. 83% are single-page bounces. Avg 1.3 pages/session. Median 1. Max 675.
- 1 page (bounce): 174,015 (82.89%)
- 2 pages: 24,320 (11.58%)
- 3 pages: 6,274 (2.99%)
- 4-5 pages: 3,477 (1.66%)
- 6+ pages: 1,845 (0.88%)

**Implication:** The 17% multi-page sessions are where funnel data lives. Bounces will still show at Level 1 but with no funnel progression.

### Q3: page_type Values
**ANSWER:** 9 distinct values, 89% populated. Funnel stages map cleanly:

| page_type | Count | % | Funnel Stage |
|-----------|-------|---|-------------|
| `lp-w-form` | 187,429 | 67.8% | Landing (with form) |
| `lp` | 43,875 | 15.9% | Landing |
| `(null)` | 30,409 | 11.0% | Varies (shop.vitaliv.com URLs — order/thankyou pages) |
| `pdp` | 8,833 | 3.2% | Product Detail Page |
| `order-page` | 2,974 | 1.1% | Order |
| `thank-you` | 1,514 | 0.6% | Thank You |
| `xsell` | 696 | 0.3% | Cross-sell |
| `pdp-order-form` | 641 | 0.2% | PDP + Order Form |
| `quiz` | 15 | 0.0% | Quiz/Landing |

**Decision:** Use hybrid classification — page_type when set, URL pattern fallback for null:
- `shop.vitaliv.com/.../order/...` → order stage
- `shop.vitaliv.com/.../thankyou/...` → thank-you stage

### Q4: Entry Page Distribution
**ANSWER:** 294 distinct entry pages. Very concentrated — top page has 51% of sessions.
- Top 5 entry pages cover ~78% of all sessions
- Most are `artikkel.vitaliv.com` landing pages
- Some are `shop.vitaliv.com` order pages (users landing directly on order page)
- Some are `kjop.vitaliv.com` PDP/order pages

**Note:** `url_path` field contains full URLs (includes domain). Kept as-is per user decision.

### Q5: Session Duration & Multi-Day Sessions
**ANSWER:** 85% < 1 min, but 7.9% > 24 hours (16,587 sessions).

| Duration | Sessions | % |
|----------|---------|---|
| < 1 min | 178,638 | 85.1% |
| 1-5 min | 3,237 | 1.5% |
| 5-15 min | 1,982 | 0.9% |
| 15-30 min | 953 | 0.5% |
| 30-60 min | 927 | 0.4% |
| 1-24 hours | 7,607 | 3.6% |
| > 24 hours | 16,587 | 7.9% |

**Decision:** Keep as-is — trust the tracker's session_id. The > 24h sessions are likely users returning to the same browser tab. No artificial cap.

### Q6: Funnel Stage URL Patterns
**ANSWER:** Two shop systems with different page_type behavior:

**kjop.vitaliv.com** — page_type is set: `pdp`, `order-page`, `thank-you`, `pdp-order-form`
**shop.vitaliv.com** — page_type is null, but URL contains `/order/` or `/thankyou/`

**Funnel stage classification rules (hybrid):**
```sql
CASE
  WHEN page_type IN ('lp', 'lp-w-form', 'quiz') THEN 'landing'
  WHEN page_type = 'pdp' THEN 'pdp'
  WHEN page_type = 'pdp-order-form' THEN 'pdp'
  WHEN page_type = 'order-page' THEN 'order'
  WHEN page_type = 'thank-you' THEN 'thankyou'
  WHEN page_type = 'xsell' THEN 'xsell'
  -- Fallback for null page_type (shop.vitaliv.com)
  WHEN url_path LIKE '%/thankyou/%' THEN 'thankyou'
  WHEN url_path LIKE '%/order/%' THEN 'order'
  ELSE 'other'
END AS funnel_stage
```

### Q7: Materialized View Size Estimate
**ANSWER:** ~126K sessions/month, ~166K page views/month.

| Month | Sessions | Page Views | Visitors | Avg pages/session |
|-------|---------|-----------|---------|-------------------|
| 2026-01 | 126,209 | 166,109 | 130,950 | 1.3 |
| 2026-02 (partial) | 89,513 | 110,277 | 90,757 | 1.2 |

**View size estimate:** ~125K rows/month in session_entries. With ~40 columns per row, this is very small — no performance concern. Total historical data depends on how far back `event_page_view_enriched_v2` goes.

---

## 6. Implementation Plan

### Phase 0: Data Exploration (MUST complete before any code)

Run the exploration queries from Section 5 against the production database. Document findings. Based on results, refine:
- Funnel stage classification rules (page_type vs URL patterns)
- Session_id null handling strategy
- Performance expectations for materialized view

**Deliverable:** Updated Section 5 with actual data, firm decisions on Q1-Q7.

---

### Phase 1: Database — Session Entries Materialized View

#### Task 1.1: Write the migration SQL

**Files:**
- Create: `scripts/migrations/session-entries-view.sql`

Write the `CREATE MATERIALIZED VIEW` statement based on Section 4.1, refined with Phase 0 findings. Include:
- View DDL with all indexes
- Verification queries (row counts, sample data)
- Rollback instructions

#### Task 1.2: Write the refresh script

**Files:**
- Create: `scripts/refresh-session-entries.ts`

Pattern: Follow existing `scripts/refresh-crm-enriched.ts` pattern:
- REFRESH MATERIALIZED VIEW CONCURRENTLY (if possible) or full refresh
- Log timing and row counts
- Can be run via `npm run script -- scripts/refresh-session-entries.ts`

#### Task 1.3: Run migration and verify

Execute against production database. Verify:
- Row counts match expected session counts
- Entry pages look correct (spot-check)
- Funnel flags are accurate
- Indexes are created
- Query performance is acceptable

**Commit after Task 1.3:** `feat: add session_entries materialized view for session-level analytics`

---

### Phase 2: Backend — Session Query Builder & API

#### Task 2.1: Create session metric and dimension configs

**Files:**
- Create: `config/sessionColumns.ts`
- Create: `config/sessionDimensions.ts`

**Session Metrics:**
```typescript
// Session-level metrics (Level 1) — Phase I
sessions, uniqueVisitors, avgPagesPerSession, bounceRate, avgEntryTime,
reachedPdpPct, reachedOrderPct, reachedXsellPct, reachedThankYouPct

// CRM metrics — Phase II (deferred, see Appendix D)
// crmTrials, crmApproved, crmConvRate, crmApprovalRate
```

**Session Dimensions:**
```typescript
// Same as on-page but prefixed with "entry_" concept
entryUrlPath, entryPageType, entryUtmSource, entryCampaign, entryAdset, entryAd,
entryCountryCode, entryDeviceType, date, visitNumber
```

#### Task 2.2: Create session query builder

**Files:**
- Create: `lib/server/sessionQueryBuilder.ts`

This queries `remote_session_tracker.session_entries` (the new materialized view).

Key methods:
- `buildQuery(options)` — Aggregation query grouped by dimension
- `buildDrillDownQuery(options)` — Page views within sessions for a given entry page
- `buildDetailQuery(options)` — Individual session records

The aggregation query is simpler than the current on-page query builder because:
- No need for ads spending JOINs (UTM data already in session_entries)
- Funnel metrics are pre-computed flags
- Session-level, not page-view-level

Example aggregation:
```sql
SELECT
  entry_url_path AS dimension_value,
  COUNT(*) AS sessions,
  COUNT(DISTINCT ff_visitor_id) AS unique_visitors,
  ROUND(AVG(total_page_views), 1) AS avg_pages_per_session,
  ROUND(100.0 * SUM(CASE WHEN total_page_views = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS bounce_rate,
  ROUND(AVG(entry_active_time_s), 2) AS avg_entry_time,
  ROUND(100.0 * SUM(reached_pdp::int) / COUNT(*), 1) AS reached_pdp_pct,
  ROUND(100.0 * SUM(reached_order::int) / COUNT(*), 1) AS reached_order_pct,
  ROUND(100.0 * SUM(reached_xsell::int) / COUNT(*), 1) AS reached_xsell_pct,
  ROUND(100.0 * SUM(reached_thankyou::int) / COUNT(*), 1) AS reached_thankyou_pct
FROM remote_session_tracker.session_entries
WHERE session_start >= $1::date AND session_start < ($2::date + interval '1 day')
GROUP BY entry_url_path
ORDER BY sessions DESC;
```

#### Task 2.3: Create session query API endpoint

**Files:**
- Create: `app/api/on-page-analysis/sessions/query/route.ts`

Pattern: Same as current `/api/on-page-analysis/query/route.ts` but:
- Queries `session_entries` instead of `event_page_view_enriched_v2`
- Session-level metrics instead of page-view metrics
- No CRM matching in Phase I (columns reserved but show 0)

#### Task 2.4: Create session drill-down API endpoint

**Files:**
- Create: `app/api/on-page-analysis/sessions/drill-down/route.ts`

When user expands an entry page row, this endpoint returns:
- All distinct pages visited within sessions that entered through that URL
- Ordered by frequency or funnel stage
- Metrics: sessions that reached this page, avg time, drop-off rate

```sql
SELECT
  pv.url_path,
  pv.page_type,
  COUNT(DISTINCT pv.session_id) AS sessions_reached,
  ROUND(100.0 * COUNT(DISTINCT pv.session_id) / $total_sessions, 1) AS reach_pct,
  ROUND(AVG(pv.active_time_s), 2) AS avg_time
FROM remote_session_tracker.event_page_view_enriched_v2 pv
WHERE pv.session_id IN (
  SELECT session_id FROM remote_session_tracker.session_entries
  WHERE entry_url_path = $1
    AND session_start >= $2::date
    AND session_start < ($3::date + interval '1 day')
)
GROUP BY pv.url_path, pv.page_type
ORDER BY sessions_reached DESC;
```

**Commit after Phase 2:** `feat: add session-level query builder and API endpoints`

---

### Phase 3: Frontend — Session-Based Table

#### Task 3.1: Create session table store

**Files:**
- Create: `stores/sessionStore.ts`

Pattern: Follow existing `onPageStore.ts` pattern using `createTableStore`. Key differences:
- API endpoint: `/api/on-page-analysis/sessions/query`
- Drill-down fetches from `/api/on-page-analysis/sessions/drill-down`
- New metric IDs from `sessionColumns.ts`

#### Task 3.2: Update page to support session view

**Files:**
- Modify: `app/on-page-analysis/page.tsx`

Options:
- **Option A:** Replace existing view entirely with session-based view
- **Option B:** Add a toggle (Page Views / Sessions) to switch between views
- **Recommended:** Option B for initial release, deprecate page-view mode later

#### Task 3.3: Configure session columns and dimensions

**Files:**
- Reference: `config/sessionColumns.ts` (from Task 2.1)
- Reference: `config/sessionDimensions.ts` (from Task 2.1)

Ensure columns render correctly:
- Session count: number format
- Funnel percentages: percentage format
- Active time: time format (mm:ss)

#### Task 3.4: Add drill-down for funnel pages

When expanding an entry page row at Level 1, fetch and display Level 2 data showing pages within those sessions.

The existing `GenericDataTable` supports hierarchical expansion. The session store's `fetchChildren` method would call the drill-down API.

**Commit after Phase 3:** `feat: add session-based table view to on-page analytics`

---

### Phase 4: Testing & Validation

#### Task 4.1: Write integration tests

**Files:**
- Create: `tests/integration/session-entries.test.ts`

Test scenarios:
- Session with single page view → entry page is that page, bounce = true
- Session with multiple pages → entry page is first by created_at
- Funnel flags are set correctly
- Date filtering uses session_start, not individual page view dates

#### Task 4.2: Validate against production data

Run comparison queries:
- Total page views in old view vs total page views across all sessions in new view (should match)
- Total sessions in new view vs COUNT(DISTINCT session_id) from old view (should match)
- Spot-check entry pages for known URLs

**Commit after Phase 4:** `test: add integration tests for session-based analytics`

---

### Phase 5: Polish & Documentation

#### Task 5.1: Add materialized view refresh to deployment process

Document when and how to refresh `session_entries`:
- After refreshing `event_page_view_enriched_v2`
- Frequency: same as page view refresh (likely daily)
- Order: page view view first, then session entries

#### Task 5.2: Document the session model

**Files:**
- Create or update: `docs/features.md` (session analytics section)

Document all rules from Section 2 permanently in the codebase docs.

#### Task 5.3: Update CLAUDE.md if needed

Add any new conventions or patterns established during implementation.

---

## Appendix A: Migration Path

The session-based view can coexist with the current page-view view. Recommended migration:

1. **Week 1-2:** Build and deploy session view alongside existing view (toggle)
2. **Week 3:** Gather feedback, validate data accuracy
3. **Week 4:** If validated, make session view the default
4. **Later:** Remove legacy page-view mode if no longer needed

## Appendix B: Performance Considerations

- **Materialized view size:** Estimated at ~1/3 of page view count (3 pages/session avg)
- **Refresh time:** Depends on data volume. Window functions add cost — benchmark during Phase 1.
- **Query performance:** Session_entries queries should be significantly faster than current queries because they scan fewer rows (sessions < page views).
- **Drill-down performance:** Uses `session_id IN (subquery)` which is efficient with index on `session_entries.entry_url_path`.

## Appendix C: What We're NOT Changing

- The existing `event_page_view_enriched_v2` materialized view stays as-is
- The existing detail modal (individual page view records) stays
- The CRM enriched table in MariaDB stays
- The URL classification system stays
- The existing on-page API routes stay (for legacy/fallback)

## Appendix D: CRM Matching Approach (Phase II Reference)

> **This is deferred to Phase II.** This section documents how the current on-page analytics matches
> page view data (PostgreSQL) with CRM subscription data (MariaDB) so we can re-implement it
> at the session level later.

### Current Architecture

CRM data lives in MariaDB (`crm_subscription_enriched`), page views in PostgreSQL. No direct
cross-database JOIN is possible, so matching happens in the application layer.

**Files:**
- `lib/server/onPageCrmQueries.ts` — MariaDB query functions
- `lib/server/onPageTransforms.ts` — Pure matching algorithms
- `app/api/on-page-analysis/query/route.ts` — Orchestration (lines ~100-250)

### Three Matching Strategies

**Strategy 1: Direct Dimension Match** (most accurate, limited to specific dimensions)

When the current dimension has a direct CRM equivalent, query both databases grouped by that
dimension and join by value.

| On-Page Dimension | CRM Column | Notes |
|-------------------|-----------|-------|
| `utmSource` | `source_normalized` | 'adwords' → 'google', 'meta' → 'facebook' |
| `campaign` | `tracking_id_4` | Campaign ID |
| `adset` | `tracking_id_2` | Adset ID |
| `ad` | `tracking_id` | Ad ID |
| `date` | `DATE_FORMAT(date_create, '%Y-%m-%d')` | Date match |
| `countryCode` | `country_normalized` | Country code |

**Strategy 2: Visitor ID Match** (exact, preferred for non-matchable dimensions)

For dimensions without a CRM equivalent (urlPath, deviceType, pageType, etc.):

1. **PG query:** Get `(dimension_value, ff_visitor_id)` pairs from page views
2. **MariaDB query:** Get `(ff_vid, trials, approved)` grouped by `ff_vid`
3. **Application join:** Match `ff_visitor_id` = `ff_vid` exactly
4. **Attribution split:** If a visitor appears in multiple dimension values, their CRM data is
   split evenly across all dimension values they visited

```typescript
// From onPageTransforms.ts — buildVisitorCrmMatch()
// 1. Index CRM by ff_vid
// 2. Count how many dimension values each visitor appears in
// 3. Divide each visitor's trials/approved by that count
// 4. Accumulate by dimension_value
```

**Strategy 3: Tracking Combo Match** (proportional, fallback)

When ff_vid matching has gaps:

1. **PG query:** Get `(dimension_value, source, campaign_id, adset_id, ad_id, unique_visitors)`
2. **MariaDB query:** Get `(source, campaign_id, adset_id, ad_id, trials, approved)`
3. **Application join:** Match on the 4-part tracking combo key
4. **Proportional distribution:** CRM data is split across dimension values proportionally
   by their share of unique_visitors within that tracking combo

```typescript
// From onPageTransforms.ts — buildTrackingCrmMatch()
// Key: "google::campaign123::adset456::ad789"
// If this combo has 10 trials and urlPath=/pricing has 300/500 visitors in that combo:
//   /pricing gets 10 × (300/500) = 6 trials
```

**Field exclusion:** When the current dimension IS a tracking field (e.g., grouping by campaign),
that field is excluded from the combo key to avoid circular matching.

### Priority Order

The query route tries **visitor match first**, falls back to **tracking combo match**:
```typescript
const visitorMatch = visitorCrm.get(dimensionValue);
if (visitorMatch && visitorMatch.trials > 0) {
  trials = Math.round(visitorMatch.trials);
  approved = Math.round(visitorMatch.approved);
} else {
  // Fallback to tracking combo
  const trackingMatch = trackingCrm.get(dimensionValue);
  trials = trackingMatch ? Math.round(trackingMatch.trials) : 0;
  approved = trackingMatch ? Math.round(trackingMatch.approved) : 0;
}
```

### Session-Level CRM (Phase II Design Notes)

When we implement CRM for the session-based view, it should be **simpler** because:

1. Each session row has `ff_visitor_id` → direct match against `ff_vid` in CRM
2. No need for tracking combo matching — visitor ID is the primary strategy
3. **De-duplication rule:** If a visitor has multiple sessions, attribute CRM conversion to the
   entry page of their **earliest** session in the date range
4. All entry-page UTM fields are already in `session_entries` if we ever need tracking fallback

**Key insight:** The current system's complexity comes from page-view-level attribution where
one visitor can appear across many dimension values. At the session level, each session has
exactly one entry page, making attribution 1:1.
