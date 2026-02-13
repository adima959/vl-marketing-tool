# Plan: Unified CRM Query Layer

## Philosophy
One source of truth for "what CRM data to fetch." Both dashboard and marketing call the same function that runs 3 parallel queries (subscription + OTS + trial). Each consumer then applies its own merge strategy (geography map lookup vs tracking ID cross-product).

## Architecture

```
                    fetchCrmData(options)          ← NEW: single orchestrator
                    ┌────────┼────────┐
                    │        │        │
              buildQuery  buildOts  buildTrial     ← existing builders (trial gets tracking support)
                    │        │        │
                    └────────┼────────┘
                  { subscriptionRows, otsRows, trialRows }
                    ┌────────┴────────┐
                    │                 │
              Dashboard Route    getMarketingData()
              (geography merge)  (tracking ID merge)
```

## Steps

### Step 1: Fix `buildSubscriptionModeConfig` — LEFT JOIN for both modes
**File**: `lib/server/crmQueryBuilder.ts`

- Tracking mode: switch from `invoiceTrialInner` → `invoiceTrialLeft`, use `leftJoinExpr` for trial metrics
- Remove `s.deleted = 0` from tracking mode WHERE clause (dashboard doesn't use it)

### Step 2: Add tracking mode support to `buildTrialQuery`
**File**: `lib/server/crmQueryBuilder.ts`

- Add `isTracking` check (same pattern as `buildOtsQuery`)
- Use `otsTrackingDimensions` for tracking mode
- Add `buildTrialModeConfig()` method (mirrors `buildOtsModeConfig`)
- Add `CRMTrialRow` type (source + tracking IDs + trial metrics)

### Step 3: Create `fetchCrmData()` — single CRM orchestrator
**File**: `lib/server/crmQueryBuilder.ts` (exported function, not class method)

```typescript
export async function fetchCrmData(options: CRMQueryOptions): Promise<{
  subscriptionRows: CRMSubscriptionRow[];
  otsRows: CRMOtsRow[];
  trialRows: CRMTrialRow[];
}>
```
- Builds all 3 queries via `crmQueryBuilder`
- Executes in parallel via `Promise.all`
- Returns raw rows — no transforms, no indexing

### Step 4: Dashboard route uses `fetchCrmData`
**File**: `app/api/dashboard/query/route.ts`

Replace manual 3-query orchestration with single `fetchCrmData()` call. Keep existing transform logic (buildOtsMap, buildTrialMap, transformDashboardRow) unchanged.

### Step 5: Marketing pipeline uses `fetchCrmData`
**File**: `lib/server/marketingQueryBuilder.ts` — `getMarketingData()`

- Replace 2-query CRM orchestration with `fetchCrmData()` (now gets trial data too)
- Build trial index alongside CRM and OTS indexes
- Pass trial index to `matchAdsToCrm()`

### Step 6: Add trial override to `matchAdsToCrm`
**File**: `lib/server/marketingTransforms.ts`

- Add `buildTrialIndex()` (same pattern as `buildOtsIndex`)
- Add 4th param to `matchAdsToCrm()`: trial index
- Override trials/trialsApproved from trial data, add onHold
- Network/source validation same as CRM and OTS lookups

### Step 7: Wire `on_hold` through marketing types
**Files**: `lib/server/marketingQueryBuilder.ts`, `app/api/marketing/query/route.ts`

- Add `on_hold` to `AggregatedMetrics`
- Map `onHold: row.on_hold` in route (replace hardcoded 0)

### Step 8: Clean up dead code
**File**: `lib/server/crmMetrics.ts`

- Remove `innerJoinExpr` from `CRM_METRICS.trialCount` and `trialsApprovedCount`
- Remove `CRM_JOINS.invoiceTrialInner`
- Update comment on `buildSubscriptionModeConfig` (no longer differs between modes for invoice JOIN)

## Files touched (5)
1. `lib/server/crmQueryBuilder.ts` — LEFT JOIN, trial tracking mode, `fetchCrmData()`, CRMTrialRow
2. `lib/server/crmMetrics.ts` — Remove dead innerJoinExpr/invoiceTrialInner
3. `lib/server/marketingQueryBuilder.ts` — Use `fetchCrmData()`, add on_hold to AggregatedMetrics
4. `lib/server/marketingTransforms.ts` — buildTrialIndex, matchAdsToCrm trial override
5. `app/api/marketing/query/route.ts` — Map on_hold properly
6. `app/api/dashboard/query/route.ts` — Use `fetchCrmData()` instead of manual orchestration

## Not changed (already correct)
- `config/columns.ts`, `types/report.ts`, `types/dashboard.ts` — Already updated
- Dashboard transforms — Already correct
- Dashboard timeseries — Stays separate (chart-only, no marketing equivalent)

## Verification
- `npm run build` must pass
- Compare Denmark Jan 12 - Feb 9 trial counts between dashboard and marketing report
