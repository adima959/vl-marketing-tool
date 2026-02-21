# Tracker Audit — Known Issues Checklist

Baseline audit: 2026-02-21. Use this to track what's been fixed between audit runs.

## Frontend Issues

- [ ] **FE-1: Duplicate page views** — Same session + URL + same second, up to 4x.
  - Check: `SELECT COUNT(*) FROM (SELECT 1 FROM tracker_page_views GROUP BY session_id, url_path, DATE_TRUNC('second', viewed_at) HAVING COUNT(*) > 1) x`
  - Baseline: duplicates found across multiple sessions

- [ ] **FE-2: Duplicate events** — Same pv + event_name + action + signal_id + same second, up to 4x.
  - Check: `SELECT COUNT(*) FROM (SELECT 1 FROM tracker_events GROUP BY page_view_id, event_name, action, signal_id, DATE_TRUNC('second', event_at) HAVING COUNT(*) > 1) x`
  - Baseline: duplicates found

- [ ] **FE-3: Duplicate sessions** — Same visitor + same millisecond, race condition.
  - Check: `SELECT COUNT(*) FROM (SELECT 1 FROM tracker_sessions GROUP BY visitor_id, DATE_TRUNC('second', created_at) HAVING COUNT(*) > 1) x`
  - Baseline: found (iPad Safari)

- [ ] **FE-4: Sessions with zero page views** — Session created but page_view never sent.
  - Check: `SELECT COUNT(*) FROM tracker_sessions s LEFT JOIN tracker_page_views pv ON s.session_id = pv.session_id WHERE pv.page_view_id IS NULL`
  - Baseline: 61 sessions (3.8%)

- [ ] **FE-10: Events before page view** — Events fire before page_view API completes.
  - Check: `SELECT COUNT(*) FROM tracker_events e JOIN tracker_page_views pv ON e.page_view_id = pv.page_view_id WHERE e.event_at < pv.viewed_at - INTERVAL '5 seconds'`
  - Baseline: 6 events on PV 191c33d5

- [ ] **FE-13: Trailing `?` in entry_page_path** — Mismatch with actual page view URL.
  - Check: `SELECT COUNT(*) FROM tracker_sessions WHERE entry_page_path LIKE '%?'`
  - Baseline: 1 session

- [-] **FE-5: Empty referrer_url** — 34.7% of PVs have `''` instead of NULL. *Ignored.*
- [-] **FE-6: url_path stores full URLs** — 100% of rows. *Ignored.*
- [-] **FE-7: NULL page_type for shop.vitaliv.com** — 11 PVs. *Ignored.*
- [-] **FE-8: Heartbeat coverage 0.17%** — Pruned each minute. *Ignored.*
- [-] **FE-9: Signal ID naming inconsistency** — TESTIMONIAL-1 vs testimonials vs testimonial-section.
- [-] **FE-11: FCP > LCP** — 5 PVs, measurement errors. *Ignored.*
- [-] **FE-12: Screen dimension 20000** — Googlebot. *Ignored.*

## Backend Issues

- [x] **BE-3: bot_score float artifacts** — Changed `double precision` → `numeric(3,2)`. Fixed 2026-02-21.
- [x] **BE-4: Cloudflare proxy IPs** — Deleted 14 sessions + cascade. Fixed 2026-02-21.
- [x] **BE-5: Orphan visitors** — 28 cleaned up on 2026-02-21.

- [ ] **BE-1: No PK on tracker_raw_heartbeats** — Table has no primary key.
  - Check: `SELECT constraint_type FROM information_schema.table_constraints WHERE table_name = 'tracker_raw_heartbeats' AND constraint_type = 'PRIMARY KEY'`
  - Baseline: no PK

- [ ] **BE-2: Duplicate indexes** — 5 duplicate index pairs wasting disk + slowing writes.
  - Check: compare `pg_indexes` for same tablename+column combos
  - Baseline: 5 duplicate pairs

- [ ] **BE-6: tracker_visitors too thin** — Only visitor_id + first_seen_at.
  - Check: `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'tracker_visitors'`
  - Baseline: 2 columns

- [ ] **BE: CF-Connecting-IP not read** — Session creation stores Cloudflare edge IP.
  - Check: `SELECT COUNT(*) FROM tracker_sessions WHERE ip::text LIKE '104.28.%'`
  - Baseline: 14 (deleted), should stay 0

- [ ] **BE: Performance metric bounds** — No CHECK constraints on fcp_ms/lcp_ms.
  - Check: `SELECT COUNT(*) FROM tracker_page_views WHERE fcp_ms > 30000 OR lcp_ms > 30000`
  - Baseline: 28 PVs with FCP > 10s

## Ad Campaign Config

- [ ] **CONFIG-1: utm_medium stores ad group IDs** — Should be `cpc` not `168305889498`.
  - Check: `SELECT utm_medium, COUNT(*) FROM tracker_sessions WHERE utm_medium ~ '^\d+$' GROUP BY 1`
  - Baseline: numeric IDs found

- [ ] **CONFIG-2: {gclid} unresolved macro** — Literal `{gclid}` in source_click_id.
  - Check: `SELECT COUNT(*) FROM tracker_sessions WHERE source_click_id = '{gclid}'`
  - Baseline: found
