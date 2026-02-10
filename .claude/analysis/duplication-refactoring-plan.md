# Dashboard & Marketing Report Refactoring Plan

## Executive Summary

Analysis of `app/dashboard` and `app/marketing-report` reveals **~360 lines of duplicated code** across stores, hooks, and API clients, representing **8-10% of total codebase**. The duplication is concentrated in:

1. **Store logic** (80% similarity, ~340 lines)
2. **Tree expansion orchestration** (~150 lines)
3. **API client patterns** (~50 lines)
4. **URL sync hooks** (~50 lines)

**Key Finding**: Duplication level is **acceptable for two separate business domains** (ads analytics vs CRM metrics), but **tree expansion logic** and **API utilities** present high-value, low-risk refactoring opportunities.

---

## Detailed Duplication Analysis

### 1. Store Duplication (80.69% Similarity)

**Files:**
- `stores/reportStore.ts` (455 lines) - Marketing Report
- `stores/dashboardStore.ts` (420 lines) - Dashboard

**Duplicated Blocks:**

| Functionality | Lines | Similarity | Risk to Merge |
|--------------|-------|-----------|---------------|
| Dimension add/remove/reorder | ~60 | 95% | **Low** - Pure logic |
| Sort handling | ~40 | 85% | **Low** - Single difference: filter handling |
| Tree expansion orchestration | ~150 | 85% | **Low** - Generic pattern |
| Batch loading (depth-1) | ~80 | 85% | **Medium** - reportStore batches by 10, dashboard parallel |
| loadChildData() | ~50 | 75% | **Medium** - Filter parameter differs |

**Key Differences That Prevent Full Merge:**

1. **Filters**: reportStore has `filters: TableFilter[]`, dashboardStore doesn't
2. **Default dimensions**: Different business domains (ads vs CRM)
3. **Default date**: Yesterday vs today
4. **Default sort**: 'clicks' vs 'subscriptions'
5. **Data types**: `ReportRow` vs `DashboardRow`

**Total Duplication:** ~340 lines (~75% of dashboardStore)

---

### 2. API Client Duplication

**Current State:**

| Client | Pattern | Duplication |
|--------|---------|-------------|
| `dashboardClient.ts` | `createQueryClient` factory | ✅ Uses shared factory |
| `marketingClient.ts` | `createQueryClient` factory | ✅ Uses shared factory |
| `onPageClient.ts` | `createQueryClient` factory | ✅ Uses shared factory |
| `validationRateClient.ts` | **Manual fetch** | ❌ ~40 lines duplicate logic |
| `savedViewsClient.ts` | **Manual fetch** | ❌ ~30 lines duplicate logic |
| Detail clients (4 files) | `createDetailClient` factory | ⚠️ Different response types |

**Opportunities:**
- Consolidate detail response types → single `DetailQueryResponse<T>` generic
- Migrate `validationRateClient` and `savedViewsClient` to factories
- **~70 lines** can be eliminated

---

### 3. URL Sync Hook Duplication

**Current State:**

| Hook | Used By | Lines |
|------|---------|-------|
| `useUrlSync.ts` | Marketing Report | 16 |
| `useDashboardUrlSync.ts` | Dashboard | ~16 |
| `useValidationRateUrlSync.ts` | Validation Rate | ~30 |
| `useOnPageUrlSync.ts` | On-Page Analysis | ~16 |

**Pattern**: All wrap `useGenericUrlSync` with page-specific config

**Opportunity**: Create single `usePageUrlSync(config)` → **~50 lines saved**

---

### 4. Column Store Duplication

**Files:**
- `stores/columnStore.ts` (35 lines) - Marketing Report
- `stores/dashboardColumnStore.ts` (74 lines) - Dashboard

**Difference**: dashboardColumnStore has legacy migration logic

**Opportunity**: Factory pattern → `createColumnStore(key, defaults, options)` → **~40 lines saved**

---

## Refactoring Plan

### Phase 1: Low-Hanging Fruit (1-2 hours, ~200 lines saved)

#### 1.1 Extract Tree Expansion Orchestrator ⭐ **HIGHEST IMPACT**

**File to create:** `lib/utils/treeExpansion.ts`

**Extract from:**
- `stores/reportStore.ts` lines 233-386
- `stores/dashboardStore.ts` lines 220-359

**New function:**
```typescript
/**
 * Orchestrates hierarchical tree expansion with auto-expand and restore capabilities
 * @returns Updated tree with expanded children loaded
 */
export async function orchestrateTreeExpansion<T extends BaseTableRow>({
  data,
  depth,
  fetchChildFn,
  options: {
    batchSize = 10,
    shouldAutoExpand = true,
    savedExpandedKeys = [],
    parallelBatch = false,
  }
}): Promise<{
  updatedData: T[];
  expandedKeys: string[];
}> {
  // Implementation extracted from stores
}
```

**Impact:**
- **Saves ~150 lines** of duplicate code
- Makes tree expansion testable in isolation
- Simplifies store logic by delegating to pure function

**Stores become:**
```typescript
// In reportStore.loadData()
const { updatedData, expandedKeys } = await orchestrateTreeExpansion({
  data: topLevelData,
  depth: 0,
  fetchChildFn: (parentKey, parentValue, depth) => fetchMarketingData({...}),
  options: {
    batchSize: 10,
    shouldAutoExpand: true,
    savedExpandedKeys: get().expandedRowKeys,
  }
});
```

**Testing:** Extract to utility, add tests for auto-expand/restore scenarios

---

#### 1.2 Create Column Store Factory

**File to create:** `lib/factories/createColumnStore.ts`

**Replace:**
- `stores/columnStore.ts`
- `stores/dashboardColumnStore.ts`

**New implementation:**
```typescript
export function createColumnStore(config: {
  storageKey: string;
  defaultColumns: string[];
  version?: number;
  migrate?: (state: any) => any;
}) {
  return create<ColumnStore>()(
    persist(
      (set) => ({
        visibleColumns: config.defaultColumns,
        toggleColumn: (column) => {...},
        setVisibleColumns: (columns) => set({ visibleColumns: columns }),
        resetToDefaults: () => set({ visibleColumns: config.defaultColumns }),
      }),
      {
        name: config.storageKey,
        version: config.version ?? 0,
        migrate: config.migrate,
      }
    )
  );
}
```

**Usage:**
```typescript
// stores/columnStore.ts
export const useColumnStore = createColumnStore({
  storageKey: 'column-settings',
  defaultColumns: DEFAULT_VISIBLE_COLUMNS,
});

// stores/dashboardColumnStore.ts
export const useDashboardColumnStore = createColumnStore({
  storageKey: 'dashboard-column-settings',
  defaultColumns: DEFAULT_VISIBLE_COLUMNS,
  version: 1,
  migrate: (state) => {...},
});
```

**Impact:** ~40 lines saved, better consistency

---

### Phase 2: API Client Consolidation (2 hours, ~70 lines saved)

#### 2.1 Standardize Detail Response Types

**File to modify:** `lib/types/api.ts`

**Current types:**
- `FetchDetailsResponse` (dashboard, marketing)
- `OnPageDetailData` (on-page)
- `MarketingDetailResponse` (marketing)

**Consolidate to:**
```typescript
export interface DetailQueryResponse<T = DetailRecord> {
  success: boolean;
  data?: {
    records: T[];
    total: number;
    page: number;
    pageSize: number;
  };
  error?: string;
}
```

**Update all detail clients:**
- `dashboardDetailsClient.ts`
- `marketingDetailsClient.ts`
- `onPageDetailsClient.ts`
- `onPageCrmDetailsClient.ts`

**Impact:** Type safety, ~20 lines saved

---

#### 2.2 Migrate Manual Fetch Clients to Factories

**Files to refactor:**
- `lib/api/validationRateClient.ts` → use `createQueryClient`
- `lib/api/savedViewsClient.ts` → create `createRestClient` factory

**New factory:** `lib/api/createRestClient.ts`
```typescript
export function createRestClient<T>(
  endpoint: string,
  config?: { timeout?: number }
) {
  return {
    get: async (id?: string) => {...},
    post: async (data: Partial<T>) => {...},
    patch: async (id: string, data: Partial<T>) => {...},
    delete: async (id: string) => {...},
  };
}
```

**Impact:** ~50 lines saved, consistent error handling

---

### Phase 3: URL Sync Consolidation (1-2 hours, ~50 lines saved)

#### 3.1 Create Unified URL Sync Hook

**File to create:** `hooks/usePageUrlSync.ts`

**Replace:**
- `useUrlSync.ts`
- `useDashboardUrlSync.ts`
- `useOnPageUrlSync.ts`

**New signature:**
```typescript
export function usePageUrlSync<TRow extends BaseTableRow>(config: {
  storeName: 'reportStore' | 'dashboardStore' | 'onPageStore';
  defaultSort?: string;
  includeFilters?: boolean;
  restoreExpandedKeys?: boolean;
}) {
  // Wraps useGenericUrlSync with config-driven behavior
}
```

**Impact:** ~50 lines saved, easier to maintain

**Note:** `useValidationRateUrlSync` is different enough (period columns) to keep separate

---

### Phase 4: Optional - Store Factory (DEFER)

**When to do this:** Only if adding 3rd hierarchical view (beyond marketing/dashboard)

**Why defer:**
- Current 80% similarity is acceptable for two domains
- TypeScript complexity high for generic factory
- Filter handling difference creates runtime branching
- Future domain-specific state (charts, time-series) would complicate shared store

**Alternative:** Extract shared helpers (already done in Phase 1) and keep stores separate

---

## Implementation Priority

| Phase | Effort | Lines Saved | Risk | Priority |
|-------|--------|-------------|------|----------|
| **1.1 Tree Expansion** | 2-3h | ~150 | Low | ⭐⭐⭐ **DO FIRST** |
| **1.2 Column Store Factory** | 1h | ~40 | Low | ⭐⭐⭐ High |
| **2.1 Detail Response Types** | 1h | ~20 | Low | ⭐⭐ Medium |
| **2.2 Migrate Manual Clients** | 1-2h | ~50 | Medium | ⭐⭐ Medium |
| **3.1 URL Sync Consolidation** | 2h | ~50 | Medium | ⭐ Low |
| **4. Store Factory** | 4-6h | ~300 | High | ❌ **DEFER** |

**Total Phase 1-3:** ~6-9 hours, **~360 lines saved**, low-medium risk

---

## Testing Strategy

### Phase 1: Tree Expansion
1. Unit tests for `orchestrateTreeExpansion()`
   - Auto-expand depth-1
   - Restore expanded keys level-by-level
   - Batch loading (parallel vs sequential)
2. Integration tests for stores using the utility
3. Manual testing: Marketing Report + Dashboard expand/collapse

### Phase 2: API Clients
1. Type-check all detail client usages
2. Test validation rate client with new factory
3. Test saved views CRUD operations
4. Verify error handling and timeout behavior

### Phase 3: URL Sync
1. Test URL param serialization/deserialization
2. Test saved view application
3. Test page reload with URL state restoration

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking tree expansion** | High | Comprehensive tests before extraction |
| **TypeScript inference loss** | Medium | Use strict generic constraints, test with both stores |
| **URL sync regression** | Medium | Test all pages (marketing, dashboard, on-page, validation) |
| **API client timeout changes** | Low | Keep default timeouts, only refactor structure |
| **Store factory complexity** | High | Don't do Phase 4 unless necessary |

---

## Rollback Strategy

Each phase is independent:
- **Phase 1:** If tree expansion breaks, revert utility and restore store logic
- **Phase 2:** If API clients fail, revert to manual fetch implementations
- **Phase 3:** If URL sync breaks, revert to individual hooks

**Git strategy:** One commit per phase with clear rollback instructions

---

## File Changes Summary

### New Files Created (4)
- `lib/utils/treeExpansion.ts` - Tree expansion orchestrator
- `lib/factories/createColumnStore.ts` - Column store factory
- `lib/api/createRestClient.ts` - REST client factory
- `hooks/usePageUrlSync.ts` - Unified URL sync hook

### Files Modified (15+)
- `stores/reportStore.ts` - Use tree expansion utility
- `stores/dashboardStore.ts` - Use tree expansion utility
- `stores/columnStore.ts` - Replace with factory call
- `stores/dashboardColumnStore.ts` - Replace with factory call
- `lib/types/api.ts` - Standardize DetailQueryResponse
- `lib/api/validationRateClient.ts` - Use createQueryClient
- `lib/api/savedViewsClient.ts` - Use createRestClient
- `lib/api/*DetailsClient.ts` (4 files) - Use standard response type
- `hooks/useUrlSync.ts` - Replace with usePageUrlSync
- `hooks/useDashboardUrlSync.ts` - Replace with usePageUrlSync
- `hooks/useOnPageUrlSync.ts` - Replace with usePageUrlSync

### Files Deleted (0)
- Keep existing hooks as thin wrappers for backward compatibility during migration

---

## Success Criteria

✅ **Phase 1 Complete When:**
- Tree expansion utility tested and used by both stores
- Column store factory used by all column stores
- No regressions in expand/collapse behavior
- ~190 lines removed from stores

✅ **Phase 2 Complete When:**
- All detail clients use `DetailQueryResponse<T>`
- Manual fetch clients migrated to factories
- All API tests passing
- ~70 lines removed from API clients

✅ **Phase 3 Complete When:**
- All pages use `usePageUrlSync` or thin wrappers
- URL state restoration working across all pages
- Saved views working correctly
- ~50 lines removed from hooks

✅ **Overall Success:**
- **~310 lines removed** (excluding Phase 4)
- **No behavior changes** for users
- **Better testability** of core logic
- **Easier to add new hierarchical views**

---

## Future Considerations

### When to Revisit Phase 4 (Store Factory)

Implement store factory if:
1. Adding 3rd hierarchical report page
2. Duplication crosses 400+ lines
3. New view doesn't introduce domain-specific complexity

### When to Add More Abstractions

Consider further refactoring if:
1. Adding 5+ report pages with similar patterns
2. Query builders share >60% code
3. Tree expansion needs new features (virtual scrolling, infinite load)

### Documentation Updates Needed

After refactoring:
1. Update `docs/state.md` - Document tree expansion utility
2. Update `docs/api.md` - Document client factories
3. Update `docs/project-overview.md` - Note store patterns
4. Add examples in `docs/workflows/new-dashboard.md` - Use new utilities

---

## Appendix: Code Snippets

### A. Tree Expansion Utility Signature

```typescript
// lib/utils/treeExpansion.ts
export interface BaseTableRow {
  key: string;
  attribute: string;
  depth: number;
  hasChildren?: boolean;
  children?: BaseTableRow[];
}

export interface TreeExpansionOptions {
  batchSize?: number;
  shouldAutoExpand?: boolean;
  savedExpandedKeys?: string[];
  parallelBatch?: boolean;
}

export async function orchestrateTreeExpansion<T extends BaseTableRow>(
  data: T[],
  depth: number,
  fetchChildFn: (parentKey: string, parentValue: string, depth: number) => Promise<T[]>,
  options?: TreeExpansionOptions
): Promise<{ updatedData: T[]; expandedKeys: string[] }>;
```

### B. Column Store Factory Usage

```typescript
// Before (stores/columnStore.ts)
export const useColumnStore = create<ColumnStore>()(
  persist(
    (set) => ({
      visibleColumns: DEFAULT_VISIBLE_COLUMNS,
      toggleColumn: (column) => {...},
      // ... 30 more lines
    }),
    { name: 'column-settings' }
  )
);

// After
export const useColumnStore = createColumnStore({
  storageKey: 'column-settings',
  defaultColumns: DEFAULT_VISIBLE_COLUMNS,
});
```

### C. Detail Response Type Migration

```typescript
// Before
interface FetchDetailsResponse {
  success: boolean;
  data?: {
    records: DetailRecord[];
    total: number;
    // ...
  };
}

// After (all clients)
import { DetailQueryResponse } from '@/lib/types/api';

export const fetchDashboardDetails = createDetailClient<
  Record<string, unknown>,
  DetailQueryResponse<DashboardDetailRecord>
>('/api/dashboard/details');
```

---

## Conclusion

This refactoring plan targets **~310 lines of duplication** across three phases with **6-9 hours total effort**. The approach is:

1. **Conservative**: Keep stores separate (domain differences justify some duplication)
2. **High-impact**: Extract tree expansion logic (150 lines, used by both stores)
3. **Low-risk**: Each phase is independent and reversible
4. **Pragmatic**: Defer store factory until clear need emerges

**Recommended Start:** Phase 1.1 (Tree Expansion) - Highest impact, lowest risk, most reusable.
