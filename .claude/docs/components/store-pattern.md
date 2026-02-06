# Component Template: Report Store Pattern

## Overview
Standard Zustand store pattern for dashboard/report pages with hierarchical data, filters, and loading states.

## When to Use

**Decision Tree**:
```
Need new report/dashboard? → YES
  ↓
Similar to existing reportStore or onPageStore? → YES
  ↓
→ COPY existing store, change domain-specific logic
```

**Use this pattern for**:
- Dashboard pages with hierarchical data
- Reports with date range and dimension filters
- Tables with expandable rows and sorting
- Any feature using GenericDataTable + useGenericUrlSync

## Complete Store Template

### File: `stores/myStore.ts`

```typescript
import { create } from 'zustand';
import type { MyReportRow } from '@/types/myReport';

/**
 * Store state interface
 * Follows dual-state pattern: active (user editing) vs loaded (server truth)
 */
interface MyStoreState {
  // ========================================
  // DATA (loaded from server)
  // ========================================
  reportData: MyReportRow[];
  loadedDimensions: string[];
  loadedDateRange: { start: Date; end: Date };

  // ========================================
  // UI STATE (active = user is editing)
  // ========================================
  dimensions: string[];
  dateRange: { start: Date; end: Date };
  expandedRowKeys: string[];
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;

  // ========================================
  // LOADING STATE
  // ========================================
  isLoading: boolean;
  hasLoadedOnce: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;

  // ========================================
  // ACTIONS
  // ========================================
  loadData: () => Promise<void>;
  loadChildData: (key: string, value: string, depth: number) => Promise<void>;
  setDimensions: (dimensions: string[]) => void;
  setDateRange: (range: { start: Date; end: Date }) => void;
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  setExpandedRowKeys: (keys: string[]) => void;
  reset: () => void;
}

/**
 * Default date range (last 30 days)
 */
const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start, end };
};

/**
 * My Report Store
 * Manages report data, filters, and loading states
 */
export const useMyStore = create<MyStoreState>((set, get) => ({
  // ========================================
  // INITIAL STATE
  // ========================================
  reportData: [],
  loadedDimensions: [],
  loadedDateRange: getDefaultDateRange(),

  dimensions: [],
  dateRange: getDefaultDateRange(),
  expandedRowKeys: [],
  sortColumn: null,
  sortDirection: null,

  isLoading: false,
  hasLoadedOnce: false,
  error: null,
  hasUnsavedChanges: false,

  // ========================================
  // LOAD DATA (parent rows only)
  // ========================================
  loadData: async () => {
    const { dimensions, dateRange, sortColumn, sortDirection } = get();

    // Validate inputs
    if (dimensions.length === 0) {
      set({ error: 'At least one dimension is required' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      // Call your API
      const response = await fetch('/api/my-report/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimensions,
          dateRange: {
            start: dateRange.start.toISOString().split('T')[0],
            end: dateRange.end.toISOString().split('T')[0],
          },
          sortColumn,
          sortDirection,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load data');
      }

      // Update state with loaded data
      set({
        reportData: result.data,
        loadedDimensions: [...dimensions],
        loadedDateRange: { ...dateRange },
        isLoading: false,
        hasLoadedOnce: true,
        hasUnsavedChanges: false,
        expandedRowKeys: [], // Collapse all rows on new data load
      });
    } catch (error: any) {
      set({
        error: error.message || 'An error occurred',
        isLoading: false,
      });
    }
  },

  // ========================================
  // LOAD CHILD DATA (lazy loading on expand)
  // ========================================
  loadChildData: async (key: string, value: string, depth: number) => {
    const { dimensions, dateRange, reportData } = get();

    // Determine next dimension
    const nextDimension = dimensions[depth + 1];
    if (!nextDimension) return; // No more dimensions to drill into

    try {
      // Call API for child rows
      const response = await fetch('/api/my-report/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimensions: dimensions.slice(0, depth + 2), // Include parent + next dimension
          dateRange: {
            start: dateRange.start.toISOString().split('T')[0],
            end: dateRange.end.toISOString().split('T')[0],
          },
          parentKey: key,
          parentValue: value,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load child data');
      }

      // Insert child rows into reportData
      const updateRowChildren = (rows: MyReportRow[]): MyReportRow[] => {
        return rows.map(row => {
          if (row.key === key) {
            return {
              ...row,
              children: result.data,
              hasChildren: result.data.length > 0,
            };
          }
          if (row.children) {
            return {
              ...row,
              children: updateRowChildren(row.children),
            };
          }
          return row;
        });
      };

      set({
        reportData: updateRowChildren(reportData),
      });
    } catch (error: any) {
      console.error('Failed to load child data:', error);
      set({ error: error.message || 'Failed to load child data' });
    }
  },

  // ========================================
  // SET DIMENSIONS
  // ========================================
  setDimensions: (dimensions: string[]) => {
    const { loadedDimensions } = get();
    const hasChanged = JSON.stringify(dimensions) !== JSON.stringify(loadedDimensions);

    set({
      dimensions,
      hasUnsavedChanges: hasChanged,
      expandedRowKeys: [], // Collapse all when dimensions change
    });
  },

  // ========================================
  // SET DATE RANGE
  // ========================================
  setDateRange: (dateRange: { start: Date; end: Date }) => {
    const { loadedDateRange } = get();
    const hasChanged =
      dateRange.start.getTime() !== loadedDateRange.start.getTime() ||
      dateRange.end.getTime() !== loadedDateRange.end.getTime();

    set({
      dateRange,
      hasUnsavedChanges: hasChanged,
      expandedRowKeys: [], // Collapse all when date range changes
    });
  },

  // ========================================
  // SET SORT
  // ========================================
  setSort: async (column: string | null, direction: 'ascend' | 'descend' | null) => {
    set({
      sortColumn: column,
      sortDirection: direction,
    });

    // Reload data with new sort
    await get().loadData();
  },

  // ========================================
  // SET EXPANDED ROWS
  // ========================================
  setExpandedRowKeys: (keys: string[]) => {
    set({ expandedRowKeys: keys });
  },

  // ========================================
  // RESET
  // ========================================
  reset: () => {
    set({
      reportData: [],
      loadedDimensions: [],
      loadedDateRange: getDefaultDateRange(),
      dimensions: [],
      dateRange: getDefaultDateRange(),
      expandedRowKeys: [],
      sortColumn: null,
      sortDirection: null,
      isLoading: false,
      hasLoadedOnce: false,
      error: null,
      hasUnsavedChanges: false,
    });
  },
}));
```

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

### Example 1: Marketing Report Store
**Location**: [stores/reportStore.ts](stores/reportStore.ts)
**Features**: Campaign hierarchy, date range, dimensions, lazy child loading

### Example 2: On-Page Analysis Store
**Location**: [stores/onPageStore.ts](stores/onPageStore.ts)
**Features**: Page hierarchy, similar structure to report store, 98% identical

## Related Documentation
- See `.claude/docs/workflows/new-dashboard.md` for complete workflow
- See `.claude/docs/components/generic-table.md` for table integration
- See `.claude/docs/components/url-sync.md` for URL sync integration
- See `.claude/docs/state.md` for detailed state management guide
- See `stores/reportStore.ts` and `stores/onPageStore.ts` for real examples
