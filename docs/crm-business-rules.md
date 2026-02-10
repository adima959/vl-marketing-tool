# CRM Business Rules

This document explains the filtering and counting logic used across Dashboard and Marketing Report to ensure consistency.

## Overview

Both Dashboard and Marketing Report count CRM metrics (subscriptions, trials, approved trials, etc.), but they do so in different ways:

- **Dashboard**: Queries CRM database directly, groups by geography (country/product/source)
- **Marketing Report**: Queries PostgreSQL for ads + MariaDB for CRM, matches via tracking IDs

Despite different query patterns, **they must use the same business rules** for what counts as a valid trial, subscription, etc.

## Single Source of Truth

### 📁 [`lib/server/crmFilters.ts`](../lib/server/crmFilters.ts)

This file defines **all shared business rules** used by both pages:

```typescript
export const CRM_FILTERS = {
  notDeletedSubscription: 's.deleted = 0',
  notDeletedInvoice: 'i.deleted = 0',
  notUpsellTagged: "(i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')",
  // ... more rules
}
```

### Functions

- **`isEligibleForTrialCount(row)`** - Check if a subscription should be counted as a trial
- **`isEligibleForMarketingMatch(row)`** - Check if a trial should appear in Marketing Report
- **`getIneligibilityReasons(row)`** - Debug helper to explain why a row is excluded

## Current Business Rules

### What Counts as a Trial?

A trial is counted if **ALL** of these are true:

1. ✅ Subscription is not deleted (`s.deleted = 0`)
2. ✅ Invoice is not deleted (`i.deleted = 0`)
3. ✅ Has a trial invoice (`i.id IS NOT NULL` and `i.type = 1`)
4. ✅ Invoice is not tagged as upsell (`i.tag NOT LIKE '%parent-sub-id=%'`)

### What Counts as an Approved Trial?

Same as trial, plus:

5. ✅ Invoice is marked (`i.is_marked = 1`)

### Marketing Report Additional Requirements

Marketing Report can only show trials that have:

6. ✅ Valid tracking IDs (`campaign_id`, `adset_id`, `ad_id` all non-null)
7. ✅ Source that matches ad network (`source IN ('adwords', 'facebook', ...)`)

## How to Update Business Rules Safely

### ⚠️ Before Making Changes

1. **Understand the impact**: Changes to filtering rules affect both Dashboard and Marketing Report
2. **Check SQL and JS**: Rules are enforced in two places:
   - SQL level: `lib/server/crmMetrics.ts` (WHERE clauses)
   - JS level: `lib/server/crmFilters.ts` (client-side validation)

### ✅ Making Changes

**Example: Exclude subscriptions from a specific source**

1. **Update SQL filters** in [`lib/server/crmMetrics.ts`](../lib/server/crmMetrics.ts):
   ```typescript
   export const CRM_WHERE = {
     // ... existing rules
     excludeTestSource: "sr.source != 'test'",
   }
   ```

2. **Update JS filters** in [`lib/server/crmFilters.ts`](../lib/server/crmFilters.ts):
   ```typescript
   export function isEligibleForTrialCount(row: CRMRowForFiltering): boolean {
     // ... existing checks

     // Exclude test source
     if (row.source === 'test') return false;

     return true;
   }
   ```

3. **Update tests** in [`tests/integration/crm-consistency.test.ts`](../tests/integration/crm-consistency.test.ts):
   ```typescript
   it('should exclude test source subscriptions', () => {
     const row = {
       subscription_deleted: 0,
       invoice_deleted: 0,
       invoice_id: 123,
       invoice_tag: null,
       source: 'test',
     };

     expect(isEligibleForTrialCount(row)).toBe(false);
   });
   ```

4. **Run tests**: `npm test`
5. **Build**: `npm run build` (TypeScript will catch type errors)
6. **Test manually**: Check both Dashboard and Marketing Report show consistent results

## Common Scenarios

### Why Dashboard Shows More Trials Than Marketing Report

This is **expected behavior**:

- **Dashboard** shows all trials (only needs invoice, not deleted)
- **Marketing Report** only shows trials with tracking IDs and source

**Example:**
- Total subscriptions on Feb 10: 20
- With invoices (not deleted, no upsell tag): 18 ← **Dashboard shows 18**
- With tracking IDs + source: 14 ← **Marketing Report shows 14**

### Debugging Count Discrepancies

Use the diagnostic scripts with shared filter functions:

```typescript
import { getIneligibilityReasons } from '@/lib/server/crmFilters';

results.forEach(row => {
  const reasons = getIneligibilityReasons(row);
  if (reasons.length > 0) {
    console.log(`Subscription ${row.id}: ${reasons.join(', ')}`);
  }
});
```

## Files to Update When Changing Business Rules

| File | Purpose | What to Update |
|------|---------|----------------|
| [`lib/server/crmFilters.ts`](../lib/server/crmFilters.ts) | Shared JS filters | Add new filter function |
| [`lib/server/crmMetrics.ts`](../lib/server/crmMetrics.ts) | SQL WHERE clauses | Add new SQL condition |
| [`lib/server/crmQueryBuilder.ts`](../lib/server/crmQueryBuilder.ts) | Apply filters in queries | Use new SQL condition |
| [`tests/integration/crm-consistency.test.ts`](../tests/integration/crm-consistency.test.ts) | Verify consistency | Add test case |

## TypeScript Will Help You

With shared types (`CRMSubscriptionRow`, `CRMOtsRow`), TypeScript will:

✅ **Catch field name mismatches** (like `approved_count` vs `trials_approved_count`)
✅ **Require all metric fields to be present** in query results
✅ **Prevent typos** when accessing row properties

Run `npm run build` to check for type errors before deploying.
