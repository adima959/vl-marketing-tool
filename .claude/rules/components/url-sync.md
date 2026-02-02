---
paths:
  - "hooks/**/*.ts"
  - "app/**/page.tsx"
---

# Component Template: useGenericUrlSync

## Overview
useGenericUrlSync is a custom hook that synchronizes dashboard state (filters, date range, sort, expanded rows) with URL query parameters.

## When to Use

**Decision Tree**:
```
Need shareable dashboard state? → YES
  ↓
State includes: date range, dimensions, filters, sort? → YES
  ↓
Using Zustand store? → YES
  ↓
→ USE useGenericUrlSync
```

**Benefits**:
- ✅ Shareable URLs (copy-paste to share exact view)
- ✅ Bookmarkable states (bookmark specific filter combination)
- ✅ Browser back/forward works correctly
- ✅ State persists across page refreshes
- ✅ Deep linking (direct link to specific view)

## Complete Implementation Template

### 1. Create Wrapper Hook

**File**: `hooks/useMyUrlSync.ts`

```typescript
import { useGenericUrlSync } from './useGenericUrlSync';
import { useMyStore } from '@/stores/myStore';
import { fetchMyData } from '@/lib/api/myClient';
import type { MyReportRow } from '@/types/myReport';

/**
 * URL sync hook for My Report
 * Syncs filters, date range, sort, and expanded rows with URL
 */
export function useMyUrlSync() {
  return useGenericUrlSync<MyReportRow>({
    useStore: useMyStore,
    fetchData: fetchMyData,
    defaultSortColumn: 'impressions', // Change to your default metric
  });
}
```

**Required parameters**:
- `useStore` - Your Zustand store hook
- `fetchData` - API client function to fetch data
- `defaultSortColumn` - Default sort column (must match metric ID)

### 2. Use in Page Component

**File**: `app/my-report/page.tsx`

```typescript
'use client';
import { useMyUrlSync } from '@/hooks/useMyUrlSync';
import { MyDataTable } from '@/components/my-report/MyDataTable';
import { FilterToolbar } from '@/components/my-report/FilterToolbar';

export default function MyReportPage() {
  // Initialize URL sync - MUST be called before rendering table
  useMyUrlSync();

  return (
    <div>
      <h1>My Report</h1>
      <FilterToolbar />
      <MyDataTable />
    </div>
  );
}
```

**Critical**: Call `useMyUrlSync()` at the top of your page component, before any UI rendering.

## URL Format

The hook syncs these query parameters:

```
?start=YYYY-MM-DD          # Start date
&end=YYYY-MM-DD            # End date
&dimensions=a,b,c          # Active dimensions (comma-separated)
&sortBy=columnId           # Sort column ID
&sortDir=ascend|descend    # Sort direction
&expanded=key1,key2        # Expanded row keys (comma-separated)
```

**Example**:
```
/my-report?start=2024-01-01&end=2024-01-31&dimensions=campaign,adGroup&sortBy=clicks&sortDir=descend&expanded=Campaign1,Campaign1::AdGroup2
```

## How It Works

### On Page Load (URL → State)

1. Hook reads URL query parameters
2. Parses dates, dimensions, sort, expanded keys
3. Updates store state with URL values
4. Triggers data fetch with parsed parameters
5. Store updates, table renders with data

### On User Action (State → URL)

1. User changes filter/sort/expand
2. Store state updates
3. Hook detects state change (via useEffect)
4. Pushes new URL with updated query params
5. Browser URL updates (without page reload)

## Store Requirements

Your store MUST have these properties for URL sync to work:

```typescript
interface RequiredStoreState {
  // Date range
  dateRange: { start: Date; end: Date };
  loadedDateRange: { start: Date; end: Date };

  // Dimensions
  dimensions: string[];
  loadedDimensions: string[];

  // Sort
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;

  // Expanded rows
  expandedRowKeys: string[];

  // Loading
  isLoading: boolean;
  hasLoadedOnce: boolean;

  // Actions
  loadData: () => Promise<void>;
  setDimensions: (dims: string[]) => void;
  setDateRange: (range: { start: Date; end: Date }) => void;
  setSort: (col: string | null, dir: 'ascend' | 'descend' | null) => Promise<void>;
  setExpandedRowKeys: (keys: string[]) => void;
}
```

See `.claude/rules/components/store-pattern.md` for complete store template.

## API Client Requirements

Your `fetchData` function must accept these parameters:

```typescript
interface FetchDataParams {
  dimensions: string[];
  dateRange: { start: Date; end: Date };
  sortColumn?: string;
  sortDirection?: 'ascend' | 'descend';
}

async function fetchMyData(params: FetchDataParams): Promise<MyReportRow[]> {
  const response = await fetch('/api/my-report/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch data');
  }

  return result.data;
}
```

## Advanced: Custom URL Parameters

If you need additional URL parameters beyond the defaults:

```typescript
export function useMyUrlSync() {
  const syncResult = useGenericUrlSync<MyReportRow>({
    useStore: useMyStore,
    fetchData: fetchMyData,
    defaultSortColumn: 'impressions',
  });

  // Add custom parameter syncing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const customParam = params.get('customParam');

    if (customParam) {
      // Handle custom parameter
      useMyStore.getState().setCustomParam(customParam);
    }
  }, []);

  return syncResult;
}
```

## Common Issues

### Issue: URL not updating on filter change
**Cause**: Store state not triggering useEffect dependencies
**Solution**: Ensure store actions update the correct state properties:
```typescript
setDimensions: (dimensions) => {
  set({ dimensions, hasUnsavedChanges: true }); // Triggers URL update
}
```

### Issue: Page load fetches data twice
**Cause**: URL sync triggers fetch AND component mount triggers fetch
**Solution**: Use `hasLoadedOnce` flag:
```typescript
// In store
loadData: async () => {
  const { hasLoadedOnce } = get();
  if (hasLoadedOnce) return; // Skip if already loaded

  set({ isLoading: true });
  // ... fetch data
  set({ isLoading: false, hasLoadedOnce: true });
}
```

### Issue: Browser back/forward not working
**Cause**: Using `router.replace()` instead of `router.push()`
**Solution**: useGenericUrlSync handles this automatically - don't manually update URL

### Issue: Expanded rows not persisting
**Cause**: Row keys format wrong or not comma-separated
**Solution**: Ensure keys use `::` separator and are properly encoded:
```typescript
// CORRECT
expandedRowKeys: ['Campaign1', 'Campaign1::AdGroup2']
// Encodes to: ?expanded=Campaign1,Campaign1::AdGroup2

// WRONG
expandedRowKeys: ['Campaign1-AdGroup2'] // Won't work with hierarchy
```

### Issue: Date format errors
**Cause**: Dates not in YYYY-MM-DD format
**Solution**: Always format dates before URL:
```typescript
const startStr = dateRange.start.toISOString().split('T')[0];
const endStr = dateRange.end.toISOString().split('T')[0];
```

## Testing URL Sync

### Manual Test Checklist

- [ ] Load page → URL has default parameters
- [ ] Change date range → URL updates
- [ ] Change dimensions → URL updates
- [ ] Change sort → URL updates
- [ ] Expand row → URL updates with key
- [ ] Copy URL → Paste in new tab → Same state loads
- [ ] Browser back → Previous state restores
- [ ] Browser forward → Next state restores
- [ ] Refresh page → State persists

### Automated Tests

```typescript
describe('useMyUrlSync', () => {
  it('syncs date range to URL', () => {
    render(<MyReportPage />);

    // Change date range
    fireEvent.change(startDateInput, { target: { value: '2024-01-01' }});

    // Check URL updated
    expect(window.location.search).toContain('start=2024-01-01');
  });

  it('loads state from URL on mount', () => {
    window.history.pushState(
      {},
      '',
      '?start=2024-01-01&end=2024-01-31&dimensions=campaign'
    );

    render(<MyReportPage />);

    // Check store has URL values
    expect(useMyStore.getState().dateRange.start).toEqual(new Date('2024-01-01'));
    expect(useMyStore.getState().dimensions).toEqual(['campaign']);
  });
});
```

## Real-World Examples

### Example 1: Report Page URL Sync
**Location**: [hooks/useUrlSync.ts](hooks/useUrlSync.ts)
**Syncs**: Date range, dimensions (campaign, adGroup, keyword), sort, expanded keys

### Example 2: On-Page Analysis URL Sync
**Location**: [hooks/useOnPageUrlSync.ts](hooks/useOnPageUrlSync.ts)
**Syncs**: Date range, dimensions (page, section, element), sort, expanded keys

## Related Documentation
- See `.claude/rules/workflows/new-dashboard.md` for complete workflow
- See `.claude/rules/components/generic-table.md` for table component
- See `.claude/rules/components/store-pattern.md` for store requirements
- See `.claude/docs/state.md` for detailed state management guide
- See `hooks/useGenericUrlSync.ts` for implementation details
