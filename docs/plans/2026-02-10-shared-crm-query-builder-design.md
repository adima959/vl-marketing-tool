# Shared CRM Query Builder - Design Document

**Date:** 2026-02-10
**Status:** Approved for Implementation
**Goal:** Consolidate CRM query building logic from Dashboard and Marketing into a single source of truth

---

## Problem Statement

Currently, CRM data fetching logic is duplicated across two locations:
- **Dashboard:** `lib/server/dashboardTableQueryBuilder.ts` (450 lines) - Groups by country/product/source
- **Marketing:** `lib/server/marketingCrmQueries.ts` (160 lines) - Groups by campaign/adset/ad via tracking IDs

This duplication means:
- ❌ Bug fixes must be applied in two places
- ❌ Metric changes require updating both query builders
- ❌ Higher maintenance burden
- ❌ Risk of inconsistencies between Dashboard and Marketing CRM metrics

---

## Solution: Unified CRM Query Builder

Create `lib/server/crmQueryBuilder.ts` that supports **both grouping strategies**:
1. **Geography Mode:** Groups by country/product/source (Dashboard)
2. **Tracking Mode:** Groups by campaign/adset/ad via tracking IDs (Marketing)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend Layer                                              │
├─────────────────────────────────────────────────────────────┤
│  Dashboard Page          │  Marketing Report Page           │
│  (Country/Product)       │  (Campaign/AdGroup/Keyword)      │
└──────────┬───────────────┴──────────────┬──────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│ API Layer                                                    │
├─────────────────────────────────────────────────────────────┤
│  /api/dashboard/query    │  /api/marketing/query            │
│  (MariaDB CRM only)      │  (PostgreSQL Ads + MariaDB CRM)  │
└──────────┬───────────────┴──────────────┬──────────────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Shared Query Builder Layer (NEW)                            │
├─────────────────────────────────────────────────────────────┤
│  lib/server/crmQueryBuilder.ts                              │
│  ├─ buildQuery(options)         → Subscription/trial query  │
│  ├─ buildOtsQuery(options)      → OTS query                 │
│  └─ buildTimeSeriesQuery(...)   → Time series chart query   │
│                                                              │
│  Supports two grouping strategies:                          │
│  ✓ Geography Mode: country/product/source (Dashboard)       │
│  ✓ Tracking Mode: campaign/adset/ad via tracking IDs        │
└─────────────────────────────────────────────────────────────┘
```

---

## Interface Design

```typescript
// lib/server/crmQueryBuilder.ts

export type GroupByStrategy =
  | { type: 'geography'; dimensions: string[] }  // Dashboard: country/product/source
  | { type: 'tracking'; dimensions: string[] };  // Marketing: campaign/adset/ad

export interface CRMQueryOptions {
  dateRange: { start: Date; end: Date };
  groupBy: GroupByStrategy;
  depth: number;
  parentFilters?: Record<string, string>;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
  productFilter?: string; // Optional: '%Balansera%'
  limit?: number;
}

export class CRMQueryBuilder {
  /**
   * Build subscription query with either geography or tracking grouping
   * Returns SQL query string and parameters
   */
  public buildQuery(options: CRMQueryOptions): { query: string; params: SqlParam[] }

  /**
   * Build OTS query with either geography or tracking grouping
   * Returns SQL query string and parameters
   */
  public buildOtsQuery(options: CRMQueryOptions): { query: string; params: SqlParam[] }

  /**
   * Build time series query for dashboard chart
   * Returns SQL query string and parameters
   */
  public buildTimeSeriesQuery(dateRange: DateRange): { query: string; params: SqlParam[] }
}

export const crmQueryBuilder = new CRMQueryBuilder();
```

---

## Query Generation Examples

### Geography Mode (Dashboard)

```sql
SELECT
  c.country,
  COALESCE(p.product_name, p_sub.product_name) AS product_name,
  COUNT(DISTINCT s.id) AS subscription_count,
  COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
  COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count,
  COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS trials_approved_count,
  COUNT(DISTINCT uo.id) AS upsell_count,
  COUNT(DISTINCT CASE WHEN uo.is_marked = 1 THEN uo.id END) AS upsells_approved_count
FROM subscription s
LEFT JOIN customer c ON s.customer_id = c.id
LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
LEFT JOIN product p ON p.id = ip.product_id
LEFT JOIN product p_sub ON p_sub.id = s.product_id
LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
  AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
...
WHERE s.date_create BETWEEN ? AND ?
  AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
  AND c.country = ?  -- parent filter
GROUP BY c.country, COALESCE(p.product_name, p_sub.product_name)
ORDER BY subscription_count DESC
LIMIT 1000
```

### Tracking Mode (Marketing)

```sql
SELECT
  s.tracking_id_4 AS campaign_id,
  s.tracking_id_2 AS adset_id,
  s.tracking_id AS ad_id,
  DATE(s.date_create) AS date,
  COUNT(DISTINCT s.id) AS subscription_count,
  COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
  COUNT(DISTINCT i.id) AS trial_count,
  COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) AS trials_approved_count,
  COUNT(DISTINCT uo.id) AS upsell_count,
  COUNT(DISTINCT CASE WHEN uo.is_marked = 1 THEN uo.id END) AS upsells_approved_count
FROM subscription s
INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
LEFT JOIN customer c ON s.customer_id = c.id
LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
  AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
...
WHERE s.date_create BETWEEN ? AND ?
  AND s.deleted = 0  -- Marketing excludes deleted subscriptions
  AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
  AND s.tracking_id_4 IS NOT NULL
  AND s.tracking_id_4 != 'null'
  AND s.tracking_id_2 IS NOT NULL
  AND s.tracking_id_2 != 'null'
  AND s.tracking_id IS NOT NULL
  AND s.tracking_id != 'null'
  AND s.tracking_id_4 = ?  -- parent filter for campaign
GROUP BY s.tracking_id_4, s.tracking_id_2, s.tracking_id, DATE(s.date_create)
ORDER BY subscription_count DESC
LIMIT 1000
```

**Key Differences Handled:**
1. ✅ Different GROUP BY columns (geography vs tracking IDs)
2. ✅ Different JOINs (LEFT for dashboard, INNER for marketing on invoice)
3. ✅ Different WHERE conditions (tracking validation for marketing, deleted subscription exclusion)
4. ✅ Uses same metric expressions from `CRM_METRICS` in `crmMetrics.ts`

---

## Migration Strategy

### Phase 1: Create Shared Builder (No Breaking Changes)

Create `lib/server/crmQueryBuilder.ts` with consolidated logic. The new builder exists alongside the old code.

**Files Created:**
- ✅ `lib/server/crmQueryBuilder.ts`

**No API changes yet** - this phase is purely additive.

---

### Phase 2: Migrate Dashboard API

Update `app/api/dashboard/query/route.ts` to use the shared builder:

**Before:**
```typescript
const { query, params } = dashboardTableQueryBuilder.buildQuery(queryOptions);
const { query: otsQuery, params: otsParams } = dashboardTableQueryBuilder.buildOtsQuery(queryOptions);
```

**After:**
```typescript
const { query, params } = crmQueryBuilder.buildQuery({
  dateRange,
  groupBy: { type: 'geography', dimensions: body.dimensions },
  depth: body.depth,
  parentFilters: body.parentFilters,
  sortBy: body.sortBy || 'subscriptions',
  sortDirection: body.sortDirection || 'DESC',
});

const { query: otsQuery, params: otsParams } = crmQueryBuilder.buildOtsQuery({
  dateRange,
  groupBy: { type: 'geography', dimensions: body.dimensions },
  depth: body.depth,
  parentFilters: body.parentFilters,
});
```

**Verification:**
- Dashboard page loads without errors
- Table shows correct metrics (compare with pre-migration)
- Expanding rows loads child data correctly
- Sorting by different columns works
- Date range filtering works
- Time series chart displays correctly

---

### Phase 3: Migrate Marketing API

Update `lib/server/marketingQueryBuilder.ts` to use the shared builder:

**Before:**
```typescript
const [subscriptions, ots] = await Promise.all([
  getCRMSubscriptions(crmFilters),  // From marketingCrmQueries.ts
  getCRMOts(crmFilters),            // From marketingCrmQueries.ts
]);
```

**After:**
```typescript
const { query: subQuery, params: subParams } = crmQueryBuilder.buildQuery({
  dateRange,
  groupBy: { type: 'tracking', dimensions: ['campaign', 'adset', 'ad', 'date'] },
  depth: 3, // All tracking dimensions
  productFilter: effectiveProductFilter,
});

const { query: otsQuery, params: otsParams } = crmQueryBuilder.buildOtsQuery({
  dateRange,
  groupBy: { type: 'tracking', dimensions: ['campaign', 'adset', 'ad', 'date'] },
  depth: 3,
  productFilter: effectiveProductFilter,
});

const [subscriptions, ots] = await Promise.all([
  executeMariaDBQuery(subQuery, subParams),
  executeMariaDBQuery(otsQuery, otsParams),
]);
```

**Verification:**
- Marketing Report page loads without errors
- Table shows correct metrics (compare CRM columns with Dashboard)
- Campaign → AdGroup → Keyword drill-down works
- Product filter works
- Real CPA calculation is correct (cost / approvedSales)
- Clicking metrics opens detail modal with correct data

---

### Phase 4: Cleanup

Delete obsolete files after successful migration:

**Files Deleted:**
- ❌ `lib/server/dashboardTableQueryBuilder.ts` (replaced by shared builder)
- ❌ `lib/server/marketingCrmQueries.ts` (replaced by shared builder)

---

## What Lives Where After Migration

### Shared (Single Location)

✅ **CRM subscription queries** → `lib/server/crmQueryBuilder.ts`
- Queries for customers, subscriptions, trials, trialsApproved, upsells
- Works for both geography grouping (Dashboard) and tracking ID grouping (Marketing)

✅ **CRM OTS queries** → `lib/server/crmQueryBuilder.ts`
- OTS and otsApproved counts
- Same dual-mode support

✅ **Metric definitions** → `lib/server/crmMetrics.ts` (already exists)
- SQL expressions like `COUNT(DISTINCT s.id)`, `COUNT(DISTINCT CASE WHEN ...)`
- Already shared today

### Separate (Remain Independent)

**Marketing ads data** → `lib/server/marketingQueryBuilder.ts`
- PostgreSQL queries for cost, clicks, impressions, conversions
- Not relevant to Dashboard

**Data transformation** → Each API route
- Dashboard API transforms to `DashboardRow` format
- Marketing API transforms to `ReportRow` format

---

## Testing Strategy

### Unit Tests

```typescript
// lib/server/__tests__/crmQueryBuilder.test.ts

describe('CRMQueryBuilder', () => {
  describe('Geography Mode', () => {
    it('builds query with country dimension', () => {
      const { query, params } = crmQueryBuilder.buildQuery({
        dateRange: { start: new Date('2024-01-01'), end: new Date('2024-01-31') },
        groupBy: { type: 'geography', dimensions: ['country'] },
        depth: 0,
      });

      expect(query).toContain('c.country');
      expect(query).toContain('GROUP BY c.country');
      expect(params).toHaveLength(2); // start, end dates
    });

    it('handles parent filters correctly', () => {
      const { query, params } = crmQueryBuilder.buildQuery({
        dateRange: { start: new Date('2024-01-01'), end: new Date('2024-01-31') },
        groupBy: { type: 'geography', dimensions: ['country', 'product'] },
        depth: 1,
        parentFilters: { country: 'NO' },
      });

      expect(query).toContain('c.country = ?');
      expect(params).toContain('NO');
    });
  });

  describe('Tracking Mode', () => {
    it('builds query with tracking IDs', () => {
      const { query, params } = crmQueryBuilder.buildQuery({
        dateRange: { start: new Date('2024-01-01'), end: new Date('2024-01-31') },
        groupBy: { type: 'tracking', dimensions: ['campaign', 'adset'] },
        depth: 1,
      });

      expect(query).toContain('s.tracking_id_4');
      expect(query).toContain('s.tracking_id_2');
      expect(query).toContain('s.deleted = 0'); // Marketing excludes deleted
      expect(query).toContain('GROUP BY s.tracking_id_4, s.tracking_id_2');
    });

    it('includes tracking ID validation', () => {
      const { query } = crmQueryBuilder.buildQuery({
        dateRange: { start: new Date('2024-01-01'), end: new Date('2024-01-31') },
        groupBy: { type: 'tracking', dimensions: ['campaign'] },
        depth: 0,
      });

      expect(query).toContain('s.tracking_id_4 IS NOT NULL');
      expect(query).toContain("s.tracking_id_4 != 'null'");
    });
  });
});
```

### Integration Tests

**Dashboard API:**
```bash
npm run test -- app/api/dashboard/query/route.test.ts
```

**Marketing API:**
```bash
npm run test -- app/api/marketing/query/route.test.ts
```

### Data Consistency Validation

Verify CRM metrics match between Dashboard and Marketing:

```sql
-- Test query to verify consistency
-- Same date range, same product, compare totals

-- Dashboard (Country: NO, Product: Balansera)
SELECT
  SUM(subscriptions) as total_subs,
  SUM(trials) as total_trials,
  SUM(trialsApproved) as total_approved
FROM dashboard_results
WHERE country = 'NO' AND product = 'Balansera';

-- Marketing (All campaigns for NO + Balansera)
SELECT
  SUM(crmSubscriptions) as total_subs,
  SUM(trials) as total_trials,
  SUM(approvedSales) as total_approved
FROM marketing_results
WHERE classifiedCountry = 'NO' AND classifiedProduct = 'Balansera';

-- These should match (within small margin for timing differences)
```

---

## Risk Mitigation

✅ **Each phase is independently testable** - if Phase 2 breaks, Phase 1 code is still there
✅ **No frontend changes needed** - APIs return same response format
✅ **Can roll back easily** - just revert to old query builders
✅ **Metric definitions unchanged** - still using `CRM_METRICS` from `crmMetrics.ts`

---

## Benefits

### Before (Current State)

```
Dashboard CRM logic  → dashboardTableQueryBuilder.ts (450 lines)
Marketing CRM logic  → marketingCrmQueries.ts (160 lines)
                       + marketingQueryBuilder.ts (partial)
```

**If you fix a CRM metric bug:** Fix in 2 places ❌

### After (Proposed)

```
Shared CRM logic     → crmQueryBuilder.ts (ONE location)
                       ↑                    ↑
                       │                    │
            Dashboard API          Marketing API
```

**If you fix a CRM metric bug:** Fix in 1 place ✅

---

## Success Criteria

1. ✅ Dashboard shows identical data before and after migration
2. ✅ Marketing Report shows identical CRM metrics before and after migration
3. ✅ All existing tests pass
4. ✅ CRM query logic exists in only one location (`crmQueryBuilder.ts`)
5. ✅ No breaking changes to API response formats
6. ✅ Obsolete query builders deleted (`dashboardTableQueryBuilder.ts`, `marketingCrmQueries.ts`)

---

## Next Steps

1. Implement Phase 1: Create shared builder
2. Test in isolation (unit tests)
3. Implement Phase 2: Migrate Dashboard
4. Verify Dashboard works correctly
5. Implement Phase 3: Migrate Marketing
6. Verify Marketing works correctly
7. Run data consistency validation
8. Phase 4: Delete obsolete files
9. Update documentation
