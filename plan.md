# On-Page Analytics: Flat Query Rebuild Plan

## REQUIREMENTS

Rebuild on-page analytics to use the same "flat query" pattern as the dashboard/marketing report:
1. **One API call** returns all data grouped by ALL selected dimensions (no per-level fetching)
2. **Client-side tree building** — hierarchy, sorting, expanding all happen in memory
3. **Remove old architecture** — depth-based API, per-row `loadChildData`, multi-query CRM orchestration
4. **Keep identical user-facing behavior** — same dimensions, metrics, filters, detail modal

---

## ASSUMPTIONS I'M MAKING

1. **Session mode is the target** — the page currently renders session-based components (`SessionDataTable`, `useSessionStore`). The old page-view components (`OnPageDataTable`, `useOnPageStore`) are already unused and will be deleted.
2. **No CRM metrics needed** — session mode currently has no CRM matching (no trials/approved columns). If CRM data is needed, that's a separate follow-up.
3. **Detail modal stays as-is** — `OnPageViewsModal` + `POST /api/on-page-analysis/detail` fetch raw records (not aggregated), so they're unaffected by the flat query change.
4. **URL classifications stay as-is** — admin CRUD, not part of the report data flow.
5. **`session_entries` is the primary table** — with fallback to CTE+join for `funnelStep` dimension. This dual-mode stays.
6. **Same 10 metrics** — pageViews, uniqueVisitors, bounceRate, avgActiveTime, scrollPastHero, scrollRate, formViews, formViewRate, formStarters, formStartRate.
7. **We'll reuse `GenericDataTable`** — it's already data-source agnostic (same as dashboard/marketing).

---

## SIMILAR PATTERNS FOUND

- **`lib/server/marketingQueryBuilder.ts`** — `getMarketingDataFlat()`: The exact pattern to replicate. Single GROUP BY over all dimensions, flat rows returned.
- **`lib/utils/marketingTree.ts`** — `buildMarketingTree()`: Recursive client-side tree builder. We'll create an analogous `buildSessionTree()`.
- **`stores/reportStore.ts`** — Store pattern with `loadData()` → flat fetch → tree build. No `loadChildData`. This replaces `createTableStore` usage.
- **`stores/dashboardStore.ts`** — Simpler variant (single data source, no CRM join). Closer to what session analytics needs.

---

## PLAN

### Phase 1: Flat Query (Server Side)

#### Step 1 — New flat query builder
**Files:** `lib/server/sessionQueryBuilder.ts` (rewrite)

Rewrite `sessionQueryBuilder.buildQuery()` to accept all dimensions at once (no `depth`/`parentFilters`):

```
Input:  { dateRange, dimensions: string[], filters: Filter[] }
Output: { query: string, params: any[] }
```

SQL shape:
```sql
SELECT
  se.entry_url_path AS "entryUrlPath",
  se.entry_utm_source AS "entryUtmSource",
  -- ...one column per selected dimension...
  COUNT(*) AS page_views,
  COUNT(DISTINCT se.ff_visitor_id) AS unique_visitors,
  -- ...all 10 metrics...
FROM remote_session_tracker.session_entries se
WHERE se.session_start >= $1::date AND se.session_start < ($2::date + interval '1 day')
  [AND filter conditions]
GROUP BY "entryUrlPath", "entryUtmSource", ...
```

Key changes:
- Remove `depth` and `parentFilters` parameters
- GROUP BY ALL selected dimensions simultaneously
- Enriched dims (entryCampaign/entryAdset/entryAd) still LEFT JOIN `merged_ads_spending` for human-readable names
- Funnel mode: CTE still applies when `funnelStep` is in dimensions
- Return dimension values as named keys (not generic `dimension_value`)
- Return only base metrics — derived ratios computed client-side from correct aggregated sums

#### Step 2 — New API endpoint
**Files:** `app/api/on-page-analysis/sessions/query/route.ts` (rewrite)

Simplify the route handler:
- Accept `{ dateRange, dimensions: string[], filters?: Filter[] }` (no `depth`, no `parentFilters`, no `sortBy/sortDirection`)
- Call the new flat builder
- Return `{ success: true, data: FlatSessionRow[] }`
- No CRM logic, no post-processing sort, no noise filtering (tree builder handles that)

#### Step 3 — Test the flat query
Before proceeding to frontend, test performance:
- Run the flat query with typical dimension combos (3-6 dims) against production data
- Measure response time and row count
- Verify correctness against current hierarchical results
- **Risk checkpoint**: If row counts are excessive (>50k), we may need LIMIT or a different strategy

---

### Phase 2: Client-Side Tree Builder

#### Step 4 — Session tree builder utility
**Files:** `lib/utils/sessionTree.ts` (new)

Create `buildSessionTree()` following the `buildMarketingTree()` pattern:
- Input: `FlatSessionRow[]`, `dimensions: string[]`, `sortColumn`, `sortDirection`
- Recursive `buildLevel(rows, depth)`:
  - Group rows by `dimensions[depth]` value
  - Sum base metrics (pageViews, uniqueVisitors, scrollPastHero, formViews, formStarters)
  - Compute derived metrics from correct aggregated sums (bounceRate, scrollRate, formViewRate, formStartRate, avgActiveTime)
  - Recurse for children at depth+1
- Output: `SessionReportRow[]` tree (same shape as current, compatible with `GenericDataTable`)

Key difference from marketing tree: **No CRM attachment step** — session data has no CRM metrics.

Derived metric formulas (computed from aggregated sums, NOT averaged):
- `bounceRate` = bounced / totalWithActiveTime (need raw counts, not pre-computed ratio)
- `scrollRate` = scrollPastHero / pageViews
- `formViewRate` = formViews / pageViews
- `formStartRate` = formStarters / formViews
- `avgActiveTime` = totalActiveTime / countWithActiveTime (need raw sum + count, not pre-computed avg)

**Important**: The flat query must return raw numerators/denominators for `bounceRate` and `avgActiveTime`, not pre-computed ratios. Pre-computed ratios can't be re-aggregated correctly. Specifically:
- Return `bounced_count` and `active_time_count` alongside `bounce_rate`
- Return `total_active_time` and `active_time_count` alongside `avg_active_time`

#### Step 5 — New session store
**Files:** `stores/sessionStore.ts` (rewrite)

Replace `createTableStore` usage with a custom store (like `reportStore`):
- `loadData()`: fetch flat data → build tree → set `reportData`
- `setSort()`: re-run `buildSessionTree()` in memory (no API call)
- `loadChildData`: no-op (instant expand from pre-built tree)
- Dual-state pattern: active vs loaded (dateRange, dimensions, filters)
- `hasUnsavedChanges` controls the Load Data button

---

### Phase 3: Frontend Rebuild

#### Step 6 — Update SessionDataTable
**Files:** `components/session-analysis/SessionDataTable.tsx` (modify)

- Wire to the new store shape
- Ensure column config reads `row.metrics[colId]` (matching tree builder output)
- Click handler: split `record.key` on `::` to reconstruct dimension filters for detail modal
- No functional change to user — same columns, same interactions

#### Step 7 — Update page component
**Files:** `app/on-page-analysis/page.tsx` (modify)

- Update to use new store API
- Ensure `OnPageViewsModal` still receives correct click context
- Filter toolbar should work the same (dimensions, date range, filters)

#### Step 8 — Update URL sync hook
**Files:** `hooks/useSessionUrlSync.ts` (modify)

- Remove `depth`/`parentFilters` from URL params (no longer needed)
- Keep: `dimensions`, `dateRange`, `filters`, `expanded`, `sortBy`, `sortDir`
- `expanded` keys now restore instantly (no child data fetching needed)

---

### Phase 4: Cleanup

#### Step 9 — Delete unused old code
**Files to delete:**

API routes (old page-view):
- `app/api/on-page-analysis/query/route.ts` (old depth-based page-view API)

Server logic (old page-view):
- `lib/server/onPageQueryBuilder.ts` (old depth-based builder)
- `lib/server/onPageCrmQueries.ts` (CRM matching — unused by session mode)
- `lib/server/onPageTransforms.ts` (CRM transforms — unused by session mode)

Components (old page-view):
- `components/on-page-analysis/OnPageDataTable.tsx`
- `components/on-page-analysis/OnPageFilterToolbar.tsx`
- `components/on-page-analysis/OnPageDimensionPicker.tsx`
- `components/on-page-analysis/OnPageColumnSettingsModal.tsx`
- `components/on-page-analysis/onPageViewColumns.tsx`

Stores/hooks/config/types (old page-view):
- `stores/onPageStore.ts`
- `stores/onPageColumnStore.ts`
- `hooks/useOnPageUrlSync.ts`
- `config/onPageDimensions.ts`
- `config/onPageColumns.ts`
- `types/onPageReport.ts`

Client API:
- `lib/api/onPageClient.ts` (old page-view API client)

**Files to KEEP:**
- `components/on-page-analysis/OnPageViewsModal.tsx` (detail modal — still used)
- `app/api/on-page-analysis/detail/route.ts` (detail API — still used)
- `lib/api/onPageDetailsClient.ts` (detail API client — still used)
- `app/api/on-page-analysis/url-classifications/` (admin CRUD — unrelated)
- `lib/api/urlClassificationsClient.ts` (admin CRUD — unrelated)

#### Step 10 — Verify build + types
Run `npm run build` to confirm no broken imports or type errors from deleted files.

---

## RISKS

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Flat query row explosion** | With 6 dimensions × wide cardinality (URL paths), the flat result could be 100k+ rows → slow transfer + memory | Test in Step 3. If too large: add server-side LIMIT (e.g., 10k rows per dimension combination) or keep funnel-step dims hierarchical |
| **Derived metric accuracy** | Pre-computed ratios (bounce_rate, avg_active_time) can't be re-aggregated correctly | Return raw counts (bounced_count, total_active_time, active_time_count) in flat query so tree builder computes from sums |
| **`HAVING COUNT(*) > 1` noise filter** | Current session builder filters singleton sessions. In flat mode this needs to apply BEFORE grouping, not after | Apply HAVING at the session level (in subquery/CTE if needed), not on the final grouped result |
| **Funnel mode complexity** | `funnelStep` dimension triggers CTE+JOIN mode which adds complexity to the flat approach | May need special handling: if funnelStep is selected, use a modified flat query with the CTE |
| **Breaking saved URLs** | Users may have bookmarked URLs with old params (`depth`, `parentFilters`) | New URL sync should gracefully ignore unknown params |
| **Loss of CRM data path** | Deleting `onPageCrmQueries.ts` and `onPageTransforms.ts` removes the option to add CRM back later | If CRM is needed in future, the marketing report's client-side CRM matching pattern can be adapted |

---

## QUESTIONS BEFORE PROCEEDING

1. **Session mode only, or do you want page-view mode kept/rebuilt too?** The page currently only uses session mode. The old page-view mode (with CRM data) is dead code. My plan deletes it entirely.

2. **CRM metrics (trials, approved, approval rate) — needed?** Session mode currently has NO CRM columns. If you want CRM data in the rebuilt on-page report, that's a significant addition (cross-database matching). I'd recommend doing that as a follow-up after the flat query is proven.

3. **Performance threshold** — what's acceptable? Current depth-based queries return ~100 rows per level. A flat query with 4 dimensions could return 5k-50k rows. Is 2-3 seconds acceptable? Should we cap at some row count?
