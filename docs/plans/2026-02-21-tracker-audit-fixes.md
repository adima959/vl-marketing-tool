# Tracker Audit — Consolidated Fix Plan

Audit date: 2026-02-21. Tables: `neondb.tracker_*`.

---

## Frontend Fixes (for frontend developer)

### FE-1: Duplicate page view firing
**Impact**: Inflates page view counts, skews bounce rate.
**Detail**: Same session + URL + same second, up to 4x. Worst: session `a24eb831` fired 4 PVs for same URL within 400ms.
**Fix**: Track last sent URL + timestamp, suppress within 2s window.
```js
const _lastPV = { url: null, ts: 0 };
function sendPageView(url) {
  const now = Date.now();
  if (_lastPV.url === url && now - _lastPV.ts < 2000) return;
  _lastPV.url = url;
  _lastPV.ts = now;
  // ... send
}
```

### FE-2: Duplicate event firing
**Impact**: Inflates engagement metrics (CTA clicks, scroll milestones).
**Detail**: Events fire 2-4x within <1s for same element+action. Affects `in_view`, `out_view`, `click`, `page_scroll`.
**Fix**: Per-pageview dedup cache with 1s cooldown keyed on `pageViewId:eventName:action:signalId`. For IntersectionObserver, use `unobserve()` after first trigger for one-shot events, or track in/out state for toggle events.

### FE-3: Duplicate session creation (race condition)
**Impact**: Splits single visit into two sessions.
**Detail**: Visitor `f1W8ngu3PUTGnxL3mZG1eBeZzy` — iPad Safari — created 2 sessions at exactly `15:32:38.550`.
**Fix**: Use a `sessionStorage` mutex flag during session creation. Check flag before creating, set it during API call, clear on completion.

### FE-4: 61 sessions with zero page views
**Impact**: 3.8% of sessions have no analytics data. All have NULL device/os/browser/bot_score.
**Detail**: Session endpoint is called but the subsequent page_view call either fails or never executes.
**Fix**: Either defer session creation until first page_view, or ensure page_view send retries on failure.

### FE-10: Events firing before their page view
**Impact**: 6 events on PV `191c33d5` fired 7-10s before the page view was recorded.
**Fix**: Buffer events until the page_view API call completes and returns a confirmed `page_view_id`.

### FE-13: `entry_page_path` trailing `?` mismatch
**Impact**: Session `a1fc79f9` has `entry_page_path` ending with `?` but actual PV URL doesn't.
**Fix**: Strip trailing `?` from URLs before storing: `url.replace(/\?$/, '')`.

---
