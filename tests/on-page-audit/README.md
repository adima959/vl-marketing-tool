# On-Page Tracker Audit

Automated data quality checks for the `tracker_*` tables in the Neon PostgreSQL database.

## Quick Start

```bash
npx tsx tests/on-page-audit/run-audit.ts
```

Output goes to both console (color-coded pass/warn/fail) and a JSON file in `results/YYYY-MM-DD.json`.

## What It Checks

| Category | Checks |
|----------|--------|
| **Orphans** | Sessions without page views, events without page views, orphan visitors/heartbeats |
| **Duplicates** | Duplicate page views (FE-1), events (FE-2), sessions (FE-3) |
| **Temporal** | Events before page views (FE-10), page views before sessions, heartbeats before page views |
| **Consistency** | entry_page_path mismatches (FE-13), heartbeat session_id consistency |
| **Performance** | FCP > LCP, FCP/LCP outliers > 30s |
| **Config** | Cloudflare IPs, unresolved {gclid}, numeric utm_medium, missing PKs, duplicate indexes |
| **Quality** | Bounce rate, bot count, NULL device sessions |

## Files

- `run-audit.ts` — The audit script. Run with `npx tsx`.
- `schema.md` — Frozen DB schema reference (columns, types, constraints, quirks).
- `known-issues.md` — Checklist of all known issues with verification queries and baseline counts.
- `results/` — Timestamped JSON output files (gitignored). Compare between runs.

## When to Re-Run

- After the frontend developer deploys deduplication fixes
- After backend schema changes (new columns, constraints)
- After Google Ads tracking template changes
- Periodically as more data accumulates (weekly recommended)

## Comparing Runs

JSON output files in `results/` have a `summary` object with pass/warn/fail counts and a `checks` array with per-check `id`, `value`, and `status`. Diff two files to see what changed:

```bash
diff results/2026-02-21.json results/2026-02-28.json
```
