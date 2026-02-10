# Component Template: Report Store Pattern

## Overview
Standardized Zustand store pattern for dashboard/report pages with hierarchical data, filters, and loading states.

**NEW**: All table stores now use the **`createTableStore` factory** for maximum code reuse and consistency.

## When to Use

**Decision Tree**:
```
Need new report/dashboard? → YES
  ↓
Hierarchical table with dimensions/filters? → YES
  ↓
→ USE createTableStore factory (20 lines of config)
```

**Use this pattern for**:
- Dashboard pages with hierarchical data
- Reports with date range and dimension filters
- Tables with expandable rows and sorting
- Any feature using GenericDataTable + useGenericUrlSync

## Quick Start: Using the Factory

### File: `stores/myStore.ts`

```typescript
import { fetchMyReportData } from '@/lib/api/myReportClient';
import type { MyReportRow } from '@/types/myReport';
import { createTableStore } from './createTableStore';

export const useMyStore = createTableStore<MyReportRow>({
  fetchData: (params) => fetchMyReportData(params),
  defaultDateRange: () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  },
  defaultDimensions: ['campaign', 'adGroup', 'keyword'],
  defaultSortColumn: 'clicks',
  defaultSortDirection: 'descend',
  hasFilters: true, // Set to false if no user-defined filters needed
});
```

**That's it!** The factory provides all standard actions and state management automatically.

## Factory Configuration

### TableStoreConfig<TRow>

| Property | Type | Description |
|----------|------|-------------|
| `fetchData` | `(params: QueryParams) => Promise<TRow[]>` | **Required**. API client function to fetch data |
| `defaultDateRange` | `() => DateRange` | **Required**. Function returning default date range |
| `defaultDimensions` | `string[]` | **Required**. Default dimension hierarchy (e.g., `['country', 'product']`) |
| `defaultSortColumn` | `string` | **Required**. Default column to sort by |
| `defaultSortDirection` | `'ascend' \| 'descend'` | **Required**. Default sort direction |
| `hasFilters` | `boolean` | **Optional** (default: `false`). Enable user-defined table filters |

### What the Factory Provides

The factory automatically implements:

**State**:
- `reportData: TRow[]` - Hierarchical data tree
- `dimensions: string[]` / `loadedDimensions: string[]` - Dual-state pattern
- `dateRange: DateRange` / `loadedDateRange: DateRange` - Dual-state pattern
- `filters: TableFilter[]` / `loadedFilters: TableFilter[]` - If `hasFilters: true`
- `expandedRowKeys: string[]` - Currently expanded rows
- `sortColumn: string | null` / `sortDirection: 'ascend' | 'descend' | null`
- `isLoading: boolean` / `isLoadingSubLevels: boolean`
- `hasUnsavedChanges: boolean` / `hasLoadedOnce: boolean`
- `error: string | null`

**Actions**:
- `loadData()` - Load depth 0 data with auto-expansion
- `loadChildData(key, value, depth)` - Lazy-load children on expand
- `setDateRange(range)` - Update date range, mark as unsaved
- `setFilters(filters)` - Update filters (if enabled)
- `addDimension(id)` / `removeDimension(id)` / `reorderDimensions(newOrder)`
- `setSort(column, direction)` - Update sort and reload
- `setExpandedRowKeys(keys)` - Update expanded rows
- `resetFilters()` - Revert to last-loaded state

### Behavior Built-In

1. **Auto-Expansion**: Automatically expands depth 0 + depth 1 on initial load
2. **Batched Loading**: Loads depth 1 children in batches of 10 to avoid server overload
3. **Expanded Keys Restoration**: Restores expanded rows level-by-level after reload
4. **hasChildren Management**: Updates `hasChildren` property when dimensions change
5. **Dual-State Pattern**: Tracks active vs loaded state for "unsaved changes" indicator

## Key Patterns

### 1. Dual-State Pattern

**Active vs Loaded**:
- `dimensions` / `loadedDimensions`
- `dateRange` / `loadedDateRange`

**Why?**
- User can change filters WITHOUT triggering data fetch
- Only "Load Data" button syncs active → loaded
- Enables "unsaved changes" indicator

**Implementation**:
```typescript
setDimensions: (dimensions) => {
  const { loadedDimensions } = get();
  const hasChanged = JSON.stringify(dimensions) !== JSON.stringify(loadedDimensions);

  set({
    dimensions,
    hasUnsavedChanges: hasChanged, // Track if changed from loaded state
  });
}
```

### 2. Lazy Child Loading

**Pattern**:
- Load parent rows on initial fetch
- Load child rows only when parent expanded
- Cache children to avoid re-fetching

**Implementation**:
```typescript
loadChildData: async (key, value, depth) => {
  // 1. Determine next dimension
  const nextDimension = dimensions[depth + 1];

  // 2. Fetch children for specific parent
  const response = await fetch('/api/query', {
    body: JSON.stringify({
      parentKey: key,
      parentValue: value,
      dimensions: dimensions.slice(0, depth + 2),
    }),
  });

  // 3. Insert children into tree
  const updateRowChildren = (rows) => {
    return rows.map(row =>
      row.key === key ? { ...row, children: result.data } : row
    );
  };

  set({ reportData: updateRowChildren(reportData) });
}
```

### 3. Hierarchical Key Format

**Format**: `parent::child::grandchild`

**Example**:
```typescript
// Root level
key: 'Campaign1'

// First child
key: 'Campaign1::AdGroup2'

// Second child
key: 'Campaign1::AdGroup2::Keyword3'
```

**Benefits**:
- Unique across entire tree
- Can reconstruct hierarchy from key
- Works with URL parameters

### 4. Collapse on Filter Change

**Why?**
- Expanded rows may not exist in new data
- Avoids confusion when data changes
- Clean slate for new filters

**Implementation**:
```typescript
setDimensions: (dimensions) => {
  set({
    dimensions,
    expandedRowKeys: [], // ← Clear expanded rows
  });
}
```

## Column Store (Optional)

If using column visibility controls, create a separate column store:

### File: `stores/myColumnStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ColumnStoreState {
  visibleColumns: string[];
  columnOrder: string[];
  toggleColumn: (columnId: string) => void;
  reorderColumns: (oldIndex: number, newIndex: number) => void;
  resetColumns: () => void;
}

const DEFAULT_VISIBLE_COLUMNS = ['impressions', 'clicks', 'ctr', 'conversions'];
const DEFAULT_COLUMN_ORDER = ['impressions', 'clicks', 'ctr', 'costPerClick', 'conversions'];

export const useMyColumnStore = create<ColumnStoreState>()(
  persist(
    (set) => ({
      visibleColumns: DEFAULT_VISIBLE_COLUMNS,
      columnOrder: DEFAULT_COLUMN_ORDER,

      toggleColumn: (columnId: string) => {
        set((state) => ({
          visibleColumns: state.visibleColumns.includes(columnId)
            ? state.visibleColumns.filter(id => id !== columnId)
            : [...state.visibleColumns, columnId],
        }));
      },

      reorderColumns: (oldIndex: number, newIndex: number) => {
        set((state) => {
          const newOrder = [...state.columnOrder];
          const [removed] = newOrder.splice(oldIndex, 1);
          newOrder.splice(newIndex, 0, removed);
          return { columnOrder: newOrder };
        });
      },

      resetColumns: () => {
        set({
          visibleColumns: DEFAULT_VISIBLE_COLUMNS,
          columnOrder: DEFAULT_COLUMN_ORDER,
        });
      },
    }),
    {
      name: 'my-report-column-preferences', // localStorage key
    }
  )
);
```

## Common Issues

### Issue: State not persisting across page refreshes
**Cause**: Report store is NOT persisted (by design)
**Solution**: Use URL sync for shareable state. Report stores reset on refresh.

### Issue: hasUnsavedChanges always true
**Cause**: Comparing objects by reference, not value
**Solution**: Use JSON.stringify for deep comparison:
```typescript
const hasChanged = JSON.stringify(dimensions) !== JSON.stringify(loadedDimensions);
```

### Issue: Child rows not loading
**Causes**:
1. parentKey not passed to API
2. Hierarchy depth calculation wrong
3. API returns empty array

**Solutions**:
1. Verify API receives `parentKey` and `parentValue`
2. Check `depth + 1` calculation
3. Test API directly with curl/Postman

### Issue: Data fetches twice on page load
**Cause**: Both useEffect and URL sync trigger loadData
**Solution**: Use `hasLoadedOnce` flag to prevent duplicate fetches

## Real-World Examples

### Example 1: Dashboard Store
**Location**: [stores/dashboardStore.ts](stores/dashboardStore.ts)
```typescript
export const useDashboardStore = createTableStore<DashboardRow>({
  fetchData: (params) => fetchDashboardData(params),
  defaultDateRange: () => { /* today */ },
  defaultDimensions: ['country', 'productName', 'product', 'source'],
  defaultSortColumn: 'subscriptions',
  defaultSortDirection: 'descend',
  hasFilters: false, // Dashboard has no user-defined filters
});
```

### Example 2: Marketing Report Store
**Location**: [stores/reportStore.ts](stores/reportStore.ts)
```typescript
export const useReportStore = createTableStore<ReportRow>({
  fetchData: (params) => fetchMarketingData(params),
  defaultDateRange: () => { /* yesterday */ },
  defaultDimensions: ['network', 'campaign', 'adset'],
  defaultSortColumn: 'clicks',
  defaultSortDirection: 'descend',
  hasFilters: true, // Marketing report has user-defined filters
});
```

### Example 3: Factory Implementation
**Location**: [stores/createTableStore.ts](stores/createTableStore.ts)
**Lines**: ~530 lines of centralized logic
**Features**: All standard table store patterns in one reusable factory

## Migration Guide

If you have an old-style store (pre-factory), migrate like this:

**Before** (420 lines):
```typescript
export const useMyStore = create<MyStoreState>((set, get) => ({
  // 400+ lines of duplicated logic...
}));
```

**After** (20 lines):
```typescript
export const useMyStore = createTableStore<MyReportRow>({
  fetchData: (params) => fetchMyReportData(params),
  // ... config only
});
```

## Related Documentation
- See `.claude/docs/workflows/new-dashboard.md` for complete workflow
- See `.claude/docs/components/generic-table.md` for table integration
- See `.claude/docs/components/url-sync.md` for URL sync integration
- See `.claude/docs/state.md` for detailed state management guide
- See `stores/createTableStore.ts` for factory implementation
- See `stores/dashboardStore.ts` and `stores/reportStore.ts` for real examples
