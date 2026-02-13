# State Management Patterns Reference

Dense reference for Zustand stores, URL sync, and state patterns.

## Table of Contents

1. [useGenericUrlSync](#usegenericurlsync) - URL sync hook
2. [Store Architecture](#store-architecture) - Report vs Column stores
3. [Dual-State Pattern](#dual-state-pattern) - Active vs Loaded state
4. [Persistence](#persistence) - LocalStorage patterns
5. [Loading States](#loading-states) - Async patterns
6. [Store Independence](#store-independence) - Communication patterns

---

## useGenericUrlSync

**File**: `hooks/useGenericUrlSync.ts` (read source directly for implementation details)
**Purpose**: Sync Zustand store state with URL query parameters for shareable dashboard state

**Three-phase lifecycle**:
1. **Initialization**: Read URL → set store state → fetch data → restore expansion
2. **URL updates**: Store changes → debounced URL push
3. **Expansion restoration**: Level-by-level parallel loading of child data from URL

---

## Store Architecture

### Store Types

| Store | Purpose | Persistence | Example |
|-------|---------|-------------|---------|
| **Report Store** | Data, filters, loading | None (fetch fresh) | reportStore, onPageStore |
| **Column Store** | Visibility, order | LocalStorage | columnStore, onPageColumnStore |

### Report Store Pattern

All report stores use `createTableStore` factory (`stores/createTableStore.ts` — read source directly). Key state groups:
- **Data**: `reportData`, dual-state dimensions/dateRange
- **UI**: `expandedRowKeys`, sort column/direction
- **Loading**: `isLoading`, `hasLoadedOnce`, `error`, `hasUnsavedChanges`

### Column Store Pattern

**Files**: `stores/columnStore.ts`, `stores/onPageColumnStore.ts`
- Persisted via `zustand/middleware/persist` to localStorage
- State: `visibleColumns: string[]`, `columnOrder: string[]`
- Actions: `toggleColumn`, `reorderColumns`, `resetColumns`

---

## Dual-State Pattern

**Concept**: Separate "active" (user editing) from "loaded" (server truth)

### Why?

**Problem without dual-state**:
- User changes dimensions → data loads → user changes again before load completes → race condition

**Solution with dual-state**:
- User edits `dimensions` (active state)
- Click "Load Data" → copies `dimensions` to `loadedDimensions` → fetches data
- UI shows: "You have unsaved changes" if `dimensions !== loadedDimensions`

### State Pairs

| Active (User Editing) | Loaded (Server Truth) |
|-----------------------|------------------------|
| `dimensions` | `loadedDimensions` |
| `dateRange` | `loadedDateRange` |
| `sortColumn` | - (sorted immediately) |

### hasUnsavedChanges Computation

**Computation Logic:**
```typescript
get: () => ({
  // ... state

  get hasUnsavedChanges() {
    const state = get();

    // Compare dimensions (array order matters)
    const dimensionsChanged =
      JSON.stringify(state.dimensions) !== JSON.stringify(state.loadedDimensions);

    // Compare date range (timestamps must match exactly)
    const dateRangeChanged =
      state.dateRange.start.getTime() !== state.loadedDateRange.start.getTime() ||
      state.dateRange.end.getTime() !== state.loadedDateRange.end.getTime();

    return dimensionsChanged || dateRangeChanged;
  },
}),
```

**When this becomes true:**
- User adds/removes dimension pill (not committed to URL yet)
- User changes date range in picker (not loaded yet)
- User reorders dimensions (changes hierarchy)

**When this becomes false:**
- User clicks "Load Data" button
- `loadData()` completes successfully
- Active state synced to loaded state (`loadedDimensions = dimensions`, `loadedDateRange = dateRange`)

**UI Integration:**
- "Load Data" button enabled only when `hasUnsavedChanges === true`
- Button highlighted with green accent color when changes exist
- Prevents unnecessary API calls when filters haven't changed

### "Load Data" Button State Flow

1. User clicks → `loadData()` action fires
2. `isLoading = true`
3. Fetch data with active filters
4. Sync: `loadedDimensions = dimensions`, `loadedDateRange = dateRange`
5. `hasUnsavedChanges = false`, `isLoading = false`

**Critical rule**: ONLY this button triggers data fetch — dimension/date changes update active state only.
For visual specs, see `docs/design.md` > "Load Data" Button.

---

## Persistence

### LocalStorage (Column Store Only)

**What persists**:
- ✅ Column visibility (`visibleColumns`)
- ✅ Column order (`columnOrder`)
- ❌ Report data (always fetched fresh)
- ❌ Filter state (use URL instead)

**Persistence Details:**

**columnStore (PERSISTED):**
- **Mechanism:** localStorage (browser)
- **Key format:** `vitaliv-analytics-column-config` (hardcoded in store)
- **Data stored:** `{ visibleColumns: string[], columnOrder: string[] }`
- **Write timing:** Every time user toggles column or reorders
- **Read timing:** On page load (before first render)
- **Lifetime:** Until user clears browser data or calls `resetColumns()`

**reportStore (NOT PERSISTED):**
- **Mechanism:** None - always starts empty
- **Data fetched:** On first page load via URL params → `loadData()`
- **Why not persisted:** Data can be stale, large payload, security concerns
- **User expectation:** Refresh = fetch latest data

**onPageColumnStore (PERSISTED):**
- Same as columnStore but separate key: `vitaliv-analytics-onpage-column-config`

**Cross-session behavior:**
- User closes browser → reopens → column settings restored, data refetched

For persist middleware implementation, see `stores/columnStore.ts` source directly.

---

## Loading States

### Phases

1. **Not loaded yet** (`!hasLoadedOnce`):
   - Show full-page spinner or skeleton
   - No data to display

2. **Loading** (`isLoading && hasLoadedOnce`):
   - Show loading indicator on "Load Data" button
   - Disable interactions
   - Keep previous data visible

3. **Loaded** (`!isLoading && hasLoadedOnce`):
   - Show data
   - Enable interactions

4. **Error** (`error !== null`):
   - Show error message
   - Allow retry

### UI Patterns

```typescript
function MyDataTable() {
  const { reportData, isLoading, hasLoadedOnce, error } = useMyStore();

  if (error) {
    return <ErrorMessage message={error} />;
  }

  if (!hasLoadedOnce) {
    return <Spinner />;
  }

  if (reportData.length === 0) {
    return <EmptyState />;
  }

  return <Table data={reportData} loading={isLoading} />;
}
```

---

## Store Independence

**Rule**: Stores never import other stores

**Why**:
- Prevents circular dependencies
- Clear data flow
- Easier testing
- Better separation of concerns

**Communication**: Components orchestrate between stores

```typescript
// ❌ BAD: Store imports another store
// stores/reportStore.ts
import { useColumnStore } from './columnStore';

export const useReportStore = create((set) => ({
  loadData: async () => {
    const visibleColumns = useColumnStore.getState().visibleColumns; // DON'T DO THIS
    // ...
  },
}));

// ✅ GOOD: Component orchestrates
// components/MyDataTable.tsx
function MyDataTable() {
  const { reportData, loadData } = useReportStore();
  const { visibleColumns } = useColumnStore();

  // Component coordinates between stores
  const filteredData = reportData.filter((row) =>
    Object.keys(row.metrics).some((key) => visibleColumns.includes(key))
  );

  return <Table data={filteredData} />;
}
```
