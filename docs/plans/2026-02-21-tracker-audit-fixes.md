# Tracker Tables Audit — Fix Plan

Audit date: 2026-02-21. Tables: `neondb.tracker_*` (~22hrs of data).

---

## Critical

### Bounce rate 92.7%

5,152 of 5,556 sessions have only 1 page view. Either session stitching is broken (navigating within the site creates a new session instead of extending the current one), or this is inherent to the ad funnel.

**Fix:** Log `session_id` on client-side page transitions. If a user navigates from article to order page and gets a new session, the stitching logic needs fixing.

---

### Column typo: `refferer`

Column is misspelled with double-f. Will trip up anyone writing queries.

**Fix:**
```sql
ALTER TABLE tracker_sessions RENAME COLUMN refferer TO referrer;
```
Update all tracker code that reads/writes this column at the same time.

---

## Significant

### 169 sessions with zero page views (3%)

Sessions were created but no page_view event followed. User likely closed the tab before the page loaded.

**Fix:** Only persist a session after its first page_view arrives. Or accept as expected behavior and filter in queries with `WHERE EXISTS (SELECT 1 FROM tracker_page_views ...)`.

---

### 466 orphan events (1.1%)

Events reference `page_view_id`s that don't exist. These events can't be attributed to anything.

**Fix:** Buffer events until their page_view is confirmed, or add a FK constraint:
```sql
ALTER TABLE tracker_events
  ADD CONSTRAINT fk_events_page_view
  FOREIGN KEY (page_view_id) REFERENCES tracker_page_views(page_view_id);
```

---

### 538 events timestamped before their page view (1.3%)

`event_at` is earlier than the page view's `viewed_at` by more than 5 seconds. Likely client clock drift or event batching.

**Fix:** Use server-side timestamps instead of client-reported `event_at`, or normalize event timestamps relative to the page_view's `viewed_at`.

---

## Moderate

### Duplicate sessions — same visitor, same second

8 occurrences. All have `bot_score = 0.9`. Bot traffic creating rapid-fire sessions.

**Fix:** Debounce session creation in the tracker (skip if a session for this visitor was created < 2s ago). Or add a unique partial index:
```sql
CREATE UNIQUE INDEX idx_sessions_dedup
  ON tracker_sessions (visitor_id, date_trunc('second', created_at))
  WHERE bot_score < 0.5;
```

---

### Duplicate page view fires (order page fires 3x)

Same session + URL + same second, up to 3 times. Concentrated on the `order-phone-nossn` page.

**Fix:** Debounce page_view events on the client — skip if same `page_load_id` already fired. Investigate that order page for re-render triggers.


---

### 34% of sessions missing `cumulative_time_s`

1,945 sessions have no time data. Tied to the heartbeat system not being fully operational yet.

**Fix:** Once heartbeats are stable, backfill from `tracker_raw_heartbeats.cumulative_active_ms`. Until then, accept NULLs in time-based metrics.

---

### Performance metric outliers (max FCP = 16 minutes)

28 page views with FCP > 10s, max value 963,295ms. 23 page views where FCP > LCP (impossible).

**Fix:** Clamp at ingestion — reject values above 30s as invalid:
```sql
ALTER TABLE tracker_page_views
  ADD CONSTRAINT chk_fcp CHECK (fcp_ms IS NULL OR fcp_ms BETWEEN 0 AND 30000),
  ADD CONSTRAINT chk_lcp CHECK (lcp_ms IS NULL OR lcp_ms BETWEEN 0 AND 30000);
```

---

### Table bloat (12-15% dead tuples)

`tracker_page_views` has 14.86% dead tuples, `tracker_sessions` has 11.98%. Caused by frequent UPDATEs after initial insert (heartbeat/time backfills).

**Fix:** Monitor at scale. Not a problem at current size. If it becomes one, switch to append-only writes + computed views instead of in-place updates.

---

### 26 visitors with zero sessions

Visitor records created but never linked to a session.

**Fix:** Create visitors lazily — only insert after first session is confirmed. Or periodic cleanup:
```sql
DELETE FROM tracker_visitors v
WHERE NOT EXISTS (SELECT 1 FROM tracker_sessions s WHERE s.visitor_id = v.visitor_id);
```

---

### No FK constraints between tables

Referential integrity is not enforced. Allows the orphan problems above.

**Fix:** Add FKs after stabilizing the ingestion pipeline. Premature FKs cause insert failures during race conditions. Priority order:
1. `tracker_page_views.session_id → tracker_sessions.session_id`
2. `tracker_events.page_view_id → tracker_page_views.page_view_id`

---

### 36% of sessions have `browser_name = 'Unknown'`

2,068 out of 5,725 sessions. The UA parser can't identify over a third of browsers.

**Fix:** Upgrade the UA parser library (e.g., `ua-parser-js` v2 or `bowser`). Log sample unknown user agents to diagnose which browsers are being missed.
