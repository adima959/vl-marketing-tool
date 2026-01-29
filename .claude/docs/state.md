# State Management Patterns Reference

Dense reference for Zustand stores, URL sync, and state patterns.

## Table of Contents

1. [useGenericUrlSync](#usegenericurlsync) - Deep dive into URL sync hook
2. [Store Architecture](#store-architecture) - Report vs Column stores
3. [Dual-State Pattern](#dual-state-pattern) - Active vs Loaded state
4. [Store Templates](#store-templates) - Copy-paste templates
5. [Persistence](#persistence) - LocalStorage patterns
6. [Loading States](#loading-states) - Async patterns
7. [Store Independence](#store-independence) - Communication patterns

---

## useGenericUrlSync

**File**: `hooks/useGenericUrlSync.ts`
**Purpose**: Sync Zustand store state with URL query parameters for shareable dashboard state

### Type Signature

```typescript
interface BaseReportRow {
  key: string;
  depth: number;
  hasChildren?: boolean;
  children?: BaseReportRow[];
}

interface ReportState<TRow extends BaseReportRow> {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  expandedRowKeys: string[];
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;
  reportData: TRow[];
  loadedDateRange: { start: Date; end: Date };
  loadedDimensions: string[];
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  loadData: () => Promise<void>;
  setExpandedRowKeys: (keys: string[]) => void;
  loadChildData: (key: string, value: string, depth: number) => Promise<void>;
}

type StoreHook<TRow extends BaseReportRow> = {
  (): ReportState<TRow>;
  getState: () => ReportState<TRow>;
  setState: (partial: Partial<ReportState<TRow>>) => void;
};

interface UseGenericUrlSyncConfig<TRow extends BaseReportRow> {
  useStore: StoreHook<TRow>;
  fetchData: (params: any) => Promise<TRow[]>;
  defaultSortColumn: string;
}

export function useGenericUrlSync<TRow extends BaseReportRow>(
  config: UseGenericUrlSyncConfig<TRow>
): void
```

### How It Works

**Three-phase lifecycle**:

1. **Initialization** (first render):
   - Read URL parameters
   - Initialize store state from URL
   - Fetch data if parameters exist
   - Restore expansion state

2. **URL updates** (when store changes):
   - Listen to store changes
   - Update URL with new state
   - Debounced to prevent excessive updates

3. **Expansion restoration** (after data loads):
   - Read `expanded` param from URL
   - Load child data level-by-level
   - Restore UI to exact state from URL

---

### Phase 1: URL Initialization

**URL format**:
```
?start=YYYY-MM-DD&end=YYYY-MM-DD&dimensions=a,b,c&sortBy=col&sortDir=ascend&expanded=key1,key2
```

**Code**:
```typescript
useEffect(() => {
  const searchParams = new URLSearchParams(window.location.search);

  // Parse date range
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  if (startParam && endParam) {
    useStore.setState({
      dateRange: {
        start: new Date(startParam),
        end: new Date(endParam),
      },
    });
  }

  // Parse dimensions
  const dimensionsParam = searchParams.get('dimensions');
  if (dimensionsParam) {
    const dimensions = dimensionsParam.split(',');
    useStore.setState({ dimensions });
  }

  // Parse sort
  const sortByParam = searchParams.get('sortBy');
  const sortDirParam = searchParams.get('sortDir');
  if (sortByParam && sortDirParam) {
    useStore.setState({
      sortColumn: sortByParam,
      sortDirection: sortDirParam as 'ascend' | 'descend',
    });
  }

  // If params exist, load data
  if (startParam && endParam && dimensionsParam) {
    loadData();
  }
}, []); // Run once on mount
```

---

### Phase 2: URL Updates

**Trigger**: Any change to: dimensions, dateRange, sortColumn, sortDirection, expandedRowKeys

**Code**:
```typescript
useEffect(() => {
  const state = useStore.getState();

  // Build query params
  const params = new URLSearchParams();

  // Date range
  params.set('start', state.dateRange.start.toISOString().split('T')[0]);
  params.set('end', state.dateRange.end.toISOString().split('T')[0]);

  // Dimensions
  if (state.dimensions.length > 0) {
    params.set('dimensions', state.dimensions.join(','));
  }

  // Sort
  if (state.sortColumn) {
    params.set('sortBy', state.sortColumn);
    params.set('sortDir', state.sortDirection || 'descend');
  }

  // Expanded rows
  if (state.expandedRowKeys.length > 0) {
    params.set('expanded', state.expandedRowKeys.join(','));
  }

  // Update URL without reload
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);

}, [dimensions, dateRange, sortColumn, sortDirection, expandedRowKeys]);
```

---

### Phase 3: Expansion Restoration

**Challenge**: Restore expanded state requires loading child data in correct order

**Algorithm**: Level-by-level parallel loading

```typescript
async function restoreExpansionFromUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const expandedParam = searchParams.get('expanded');

  if (!expandedParam) return;

  const keysToExpand = expandedParam.split(',');

  // Group keys by depth
  const keysByDepth = new Map<number, string[]>();
  for (const key of keysToExpand) {
    const depth = (key.match(/::/g) || []).length / 2; // Count dimension pairs
    if (!keysByDepth.has(depth)) {
      keysByDepth.set(depth, []);
    }
    keysByDepth.get(depth)!.push(key);
  }

  // Load level by level (depth 0, then 1, then 2, etc.)
  const maxDepth = Math.max(...keysByDepth.keys());

  for (let depth = 0; depth <= maxDepth; depth++) {
    const keysAtDepth = keysByDepth.get(depth) || [];

    // Load all keys at this depth in parallel
    await Promise.all(
      keysAtDepth.map(async (key) => {
        // Extract value from key (last segment)
        const parts = key.split('::');
        const value = parts[parts.length - 1];

        await loadChildData(key, value, depth);
      })
    );

    // Update expanded keys
    setExpandedRowKeys([...expandedRowKeys, ...keysAtDepth]);
  }
}
```

**Behavior: Level-by-level lazy restoration**

1. **Page load:** Parse `?expanded=campaign::A,campaign::A::adgroup::B` from URL
2. **Initial render:** All rows collapsed (data not loaded yet)
3. **Restoration loop:**
   - Processes depth 0 first, then depth 1, then depth 2, etc.
   - Each depth waits for previous depth to complete
   - All keys at same depth load in parallel (faster)
4. **Result:** Tree expanded to saved state with proper parent-child hierarchy

**Timing:**
- Happens AFTER initial `loadData()` completes
- Each level waits for parent data before expanding
- May take several seconds for deep hierarchies

**Edge cases:**
- Row no longer exists: Skip that key (no error thrown)
- Parent data load fails: Stop restoration at that level
- Depth 0 rows: Expand immediately (data already loaded from initial fetch)
- Child rows: Must call `loadChildData()` first, then expand

**Why level-by-level:**
- Depth 1 children depend on depth 0 parents being loaded
- Depth 2 children depend on depth 1 parents being loaded
- Can't load depth 2 before depth 1 exists in tree

**Parallelization:**
- All keys at same depth load simultaneously
- Significantly faster than sequential loading
- Example: 10 keywords at depth 2 load in parallel, not sequentially

---

### Usage Template

```typescript
// 1. Create wrapper hook
import { useGenericUrlSync } from '@/hooks/useGenericUrlSync';
import { useMyStore } from '@/stores/myStore';
import { fetchMyData } from '@/lib/api/myClient';
import type { MyReportRow } from '@/types/myReport';

export function useMyUrlSync() {
  return useGenericUrlSync<MyReportRow>({
    useStore: useMyStore,
    fetchData: fetchMyData,
    defaultSortColumn: 'myMetric',
  });
}

// 2. Use in page
'use client';
import { useMyUrlSync } from '@/hooks/useMyUrlSync';

export default function MyPage() {
  useMyUrlSync(); // No return value, handles everything via side effects

  return <MyDataTable />;
}
```

---

## Store Architecture

### Store Types

| Store | Purpose | Persistence | Example |
|-------|---------|-------------|---------|
| **Report Store** | Data, filters, loading | None (fetch fresh) | reportStore, onPageStore |
| **Column Store** | Visibility, order | LocalStorage | columnStore, onPageColumnStore |

### Report Store Pattern

**Files**: `stores/reportStore.ts`, `stores/onPageStore.ts`

**State structure**:
```typescript
interface ReportStoreState {
  // Data
  reportData: ReportRow[];

  // Loaded state (server truth)
  loadedDimensions: string[];
  loadedDateRange: { start: Date; end: Date };

  // Active state (user editing)
  dimensions: string[];
  dateRange: { start: Date; end: Date };

  // UI state
  expandedRowKeys: string[];
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;

  // Loading
  isLoading: boolean;
  hasLoadedOnce: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;

  // Actions
  loadData: () => Promise<void>;
  loadChildData: (key: string, value: string, depth: number) => Promise<void>;
  addDimension: (dimension: string) => void;
  removeDimension: (dimension: string) => void;
  setDateRange: (range: { start: Date; end: Date }) => void;
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  setExpandedRowKeys: (keys: string[]) => void;
}
```

---

### Column Store Pattern

**Files**: `stores/columnStore.ts`, `stores/onPageColumnStore.ts`

**State structure**:
```typescript
interface ColumnStoreState {
  // Persisted state
  visibleColumns: string[];
  columnOrder: string[];

  // Actions
  toggleColumn: (columnId: string) => void;
  reorderColumns: (newOrder: string[]) => void;
  resetColumns: () => void;
}
```

**Persistence**:
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useColumnStore = create<ColumnStoreState>()(
  persist(
    (set) => ({
      visibleColumns: DEFAULT_VISIBLE,
      columnOrder: DEFAULT_ORDER,

      toggleColumn: (columnId) =>
        set((state) => ({
          visibleColumns: state.visibleColumns.includes(columnId)
            ? state.visibleColumns.filter((id) => id !== columnId)
            : [...state.visibleColumns, columnId],
        })),

      // ... other actions
    }),
    {
      name: 'my-column-store', // LocalStorage key
      version: 1,
    }
  )
);
```

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

### "Load Data" Button Logic

```typescript
<Button
  type="primary"
  onClick={loadData}
  loading={isLoading}
  disabled={!hasUnsavedChanges} // Only enabled when changes exist
>
  Load Data
</Button>
```

---

## Store Templates

### Template: Report Store

```typescript
import { create } from 'zustand';
import type { MyReportRow } from '@/types/myReport';

interface MyStoreState {
  // Data
  reportData: MyReportRow[];
  loadedDimensions: string[];
  loadedDateRange: { start: Date; end: Date };

  // Active state
  dimensions: string[];
  dateRange: { start: Date; end: Date };

  // UI
  expandedRowKeys: string[];
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;

  // Loading
  isLoading: boolean;
  hasLoadedOnce: boolean;
  error: string | null;

  // Computed
  hasUnsavedChanges: boolean;

  // Actions
  loadData: () => Promise<void>;
  loadChildData: (key: string, value: string, depth: number) => Promise<void>;
  addDimension: (dimension: string) => void;
  removeDimension: (dimension: string) => void;
  setDateRange: (range: { start: Date; end: Date }) => void;
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  setExpandedRowKeys: (keys: string[]) => void;
}

export const useMyStore = create<MyStoreState>((set, get) => ({
  // Initial state
  reportData: [],
  loadedDimensions: [],
  loadedDateRange: { start: new Date(), end: new Date() },
  dimensions: [],
  dateRange: { start: new Date(), end: new Date() },
  expandedRowKeys: [],
  sortColumn: null,
  sortDirection: null,
  isLoading: false,
  hasLoadedOnce: false,
  error: null,

  get hasUnsavedChanges() {
    const state = get();
    // Compare dimensions and date range
    return (
      JSON.stringify(state.dimensions) !== JSON.stringify(state.loadedDimensions) ||
      state.dateRange.start.getTime() !== state.loadedDateRange.start.getTime() ||
      state.dateRange.end.getTime() !== state.loadedDateRange.end.getTime()
    );
  },

  // Actions
  loadData: async () => {
    const state = get();
    set({ isLoading: true, error: null });

    try {
      const response = await fetch('/api/my-report/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimensions: state.dimensions,
          dateRange: state.dateRange,
        }),
      });

      const result = await response.json();

      if (result.success) {
        set({
          reportData: result.data,
          loadedDimensions: [...state.dimensions],
          loadedDateRange: { ...state.dateRange },
          hasLoadedOnce: true,
          isLoading: false,
        });
      } else {
        set({ error: result.error, isLoading: false });
      }
    } catch (error) {
      set({ error: 'Failed to load data', isLoading: false });
    }
  },

  loadChildData: async (key: string, value: string, depth: number) => {
    const state = get();

    try {
      const response = await fetch('/api/my-report/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimensions: state.loadedDimensions,
          dateRange: state.loadedDateRange,
          parentKey: key,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Insert children into tree
        const updatedData = insertChildrenIntoTree(state.reportData, key, result.data);
        set({ reportData: updatedData });
      }
    } catch (error) {
      console.error('Failed to load child data:', error);
    }
  },

  addDimension: (dimension: string) => {
    set((state) => ({
      dimensions: [...state.dimensions, dimension],
    }));
  },

  removeDimension: (dimension: string) => {
    set((state) => ({
      dimensions: state.dimensions.filter((d) => d !== dimension),
    }));
  },

  setDateRange: (range: { start: Date; end: Date }) => {
    set({ dateRange: range });
  },

  setSort: async (column: string | null, direction: 'ascend' | 'descend' | null) => {
    set({ sortColumn: column, sortDirection: direction });
    await get().loadData(); // Reload with new sort
  },

  setExpandedRowKeys: (keys: string[]) => {
    set({ expandedRowKeys: keys });
  },
}));
```

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

---

**Implementation**:
```typescript
import { persist } from 'zustand/middleware';

export const useColumnStore = create<ColumnStoreState>()(
  persist(
    (set) => ({
      // ... state and actions
    }),
    {
      name: 'column-store', // LocalStorage key
      version: 1, // For migrations
    }
  )
);
```

**Versioning**:
```typescript
{
  name: 'column-store',
  version: 2,
  migrate: (persistedState: any, version: number) => {
    if (version === 1) {
      // Migration from v1 to v2
      return {
        ...persistedState,
        newField: 'default value',
      };
    }
    return persistedState;
  },
}
```

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
