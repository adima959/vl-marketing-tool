# Audit: CRM Matching Patterns & Loading Skeletons

## REQUIREMENTS

Two-part codebase audit:
1. Check if any other routes/stores still use the old 4-table JOIN pattern where the enriched table should be used instead
2. Check if any other stores are missing `isLoadingSubLevels` (same bug we just fixed in onPageStore)

---

## FINDINGS

### Part 1: CRM Matching — Where Is the Old Pattern Still Used?

| Area | Pattern | Should migrate? |
|------|---------|----------------|
| **On-Page Analysis** | Enriched table + ff_vid | Already done |
| **Marketing Report** (`marketingCrmQueries.ts`) | 3-table JOIN (subscription + invoice + source) | **No** — see below |
| **Marketing Details** (`marketingDetailQueryBuilder.ts`) | Raw table JOINs + tracking tuple matching | **No** |
| **Dashboard** (`dashboardQueryBuilder.ts`, `dashboardDetailQueryBuilder.ts`) | Multi-table JOINs (subscription + customer + invoice + product + source) | **No** |
| **Validation Rate** (`validationRateQueryBuilder.ts`) | Multi-table JOINs + `invoice_proccessed` table | **No** |

#### Why NOT migrate the other areas?

The enriched table was purpose-built to solve one specific problem: **cross-database matching** (PG page views -> MariaDB CRM via tracking combos + ff_vid). The other pages query MariaDB natively with indexed JOINs — they don't have that cross-database challenge.

Specific reasons:
- **Marketing Report**: Requires product filtering via `invoice_product + product` JOIN — enriched table has no product data
- **Dashboard**: Uses country + product + source hierarchy — enriched table lacks product info
- **Validation Rate**: Needs `invoice_proccessed` table for pay/buy dates — completely different data shape
- **Detail modals**: All need customer name, email, product name, cancel reason — these require raw table JOINs for display fields anyway

The enriched table would need to grow significantly (add product, customer info, invoice_proccessed dates) to replace these queries, and the benefit would be marginal since they're already native MariaDB queries with proper indexes.

**Verdict: No CRM migration needed for marketing/dashboard/validation pages.** The old pattern is correct for those use cases.

---

### Part 2: Loading Skeletons — Missing `isLoadingSubLevels`

| Store | Has field? | Sets in `loadChildData`? | Status |
|-------|-----------|-------------------------|--------|
| `onPageStore.ts` | Yes | Yes (just fixed) | Done |
| `reportStore.ts` | Yes | Yes (line 404) | Already correct |
| `dashboardStore.ts` | Yes | **No** — never set during manual expand | **BUG** |
| `validationRateStoreFactory.ts` | No | N/A — uses own `ValidationRateDataTable` with local `loadingRowKeys` | Different pattern, works independently |

#### The one remaining gap: `dashboardStore.loadChildData()`

The dashboard store has `isLoadingSubLevels` and uses it during the initial auto-expand phase (line 232), but `loadChildData()` (lines 438-482) never sets it. So when a user manually clicks to expand a dashboard row, they get no skeleton feedback.

---

## ASSUMPTIONS

1. The validation rate table's per-row `loadingRowKeys` pattern in its own `ValidationRateDataTable` component is intentional and working — no need to change it
2. The enriched table should stay focused on on-page analysis (cross-database matching) — not grow into a general-purpose CRM cache
3. Marketing/dashboard pages are performing acceptably with native MariaDB JOINs

## PLAN

### Step 1: Fix dashboardStore loading skeleton (same 3-line fix as onPageStore)

**File**: `stores/dashboardStore.ts`
- Add `set({ isLoadingSubLevels: true })` at start of `loadChildData`
- Add `isLoadingSubLevels: false` to the success `set()` call
- Add `set({ isLoadingSubLevels: false })` in catch block

### Step 2: Build verification

Run `npm run build` to confirm zero errors.

## RISKS

- None — this is an identical 3-line pattern already proven in `reportStore` and `onPageStore`
