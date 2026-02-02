---
paths:
  - "app/**/page.tsx"
  - "components/**/*Report*.tsx"
  - "components/**/*Dashboard*.tsx"
  - "components/**/*Analysis*.tsx"
---

# Workflow: Build New Dashboard/Report Page

## Overview
Use this workflow when creating a new dashboard or report page with hierarchical data, multiple metrics, and filtering capabilities.

## Prerequisites
- Familiarize yourself with GenericDataTable component
- Review similar existing reports (DataTable, OnPageDataTable)
- Understand the data structure from the database

## Files to Create
**Expect to create 7-8 new files**:
1. Type definition (`types/myReport.ts`)
2. Column configuration (`config/myColumns.ts`)
3. Store (`stores/myStore.ts`)
4. API route (`app/api/my-report/query/route.ts`)
5. Data table wrapper (`components/my-report/MyDataTable.tsx`)
6. URL sync hook (`hooks/useMyUrlSync.ts`)
7. Page component (`app/my-report/page.tsx`)
8. (Optional) Column store (`stores/myColumnStore.ts`)

## Step-by-Step Implementation

### Step 1: Review Existing Patterns
```bash
# Search for similar components
grep -r "GenericDataTable" components/
grep -r "useGenericUrlSync" hooks/

# Review existing reports
# - components/table/DataTable.tsx
# - components/on-page-analysis/OnPageDataTable.tsx
```

### Step 2: Create Type Definitions
**File**: `types/myReport.ts`

```typescript
import type { BaseTableRow } from '@/types/table';

export interface MyReportRow extends BaseTableRow {
  key: string;          // Required: unique identifier
  attribute: string;    // Required: display text
  depth: number;        // Required: hierarchy level (0, 1, 2...)
  hasChildren?: boolean; // Optional: can expand?
  children?: MyReportRow[]; // Optional: child rows
  metrics: {            // Required: your metrics
    metric1: number;
    metric2: number;
    // Add more metrics as needed
  };
}
```

### Step 3: Create Column Configuration
**File**: `config/myColumns.ts`

```typescript
import type { MetricColumn, ColumnGroup } from '@/types';

export const MY_METRIC_COLUMNS: MetricColumn[] = [
  {
    id: 'metric1',
    label: 'Metric 1 Full Name',
    shortLabel: 'M1',
    description: 'Description shown in tooltip',
    format: 'number', // 'number' | 'percentage' | 'currency' | 'decimal' | 'time'
    category: 'basic',
    defaultVisible: true,
    width: 120,
    align: 'right',
  },
  {
    id: 'metric2',
    label: 'Metric 2 Full Name',
    shortLabel: 'M2',
    description: 'Description shown in tooltip',
    format: 'percentage',
    category: 'basic',
    defaultVisible: true,
    width: 120,
    align: 'right',
  },
  // Add more metric columns...
];

export const MY_COLUMN_GROUPS: ColumnGroup[] = [
  {
    title: 'Basic Metrics',
    metricIds: ['metric1', 'metric2']
  },
  // Add more groups...
];
```

### Step 4: Create Store
**File**: `stores/myStore.ts`

Copy from `stores/reportStore.ts` and customize:
- Update type imports (MyReportRow)
- Update API endpoint path
- Keep the same structure for state and actions

```typescript
import { create } from 'zustand';
import type { MyReportRow } from '@/types/myReport';

interface MyStoreState {
  // Data
  reportData: MyReportRow[];
  loadedDimensions: string[];
  loadedDateRange: { start: Date; end: Date };

  // UI State
  dimensions: string[];
  dateRange: { start: Date; end: Date };
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
  setDimensions: (dimensions: string[]) => void;
  setDateRange: (range: { start: Date; end: Date }) => void;
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  setExpandedRowKeys: (keys: string[]) => void;
}

export const useMyStore = create<MyStoreState>((set, get) => ({
  // Implement actions - see reportStore.ts for complete example
  // ...
}));
```

### Step 5: Create API Route
**File**: `app/api/my-report/query/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/server/db';

export async function POST(request: Request) {
  try {
    const { dimensions, dateRange, parentKey } = await request.json();

    // Build and execute query
    // Use $1, $2, $3 placeholders for PostgreSQL
    const query = `
      SELECT
        dimension_columns,
        SUM(metric1) as metric1,
        SUM(metric2) as metric2
      FROM your_table
      WHERE date >= $1 AND date <= $2
      GROUP BY dimension_columns
    `;

    const data = await db.query(query, [dateRange.start, dateRange.end]);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Query error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### Step 6: Create Data Table Wrapper
**File**: `components/my-report/MyDataTable.tsx`

```typescript
import { GenericDataTable } from '@/components/table/GenericDataTable';
import { useMyStore } from '@/stores/myStore';
import { useMyColumnStore } from '@/stores/myColumnStore';
import { MY_METRIC_COLUMNS, MY_COLUMN_GROUPS } from '@/config/myColumns';
import type { MyReportRow } from '@/types/myReport';
import styles from './MyDataTable.module.css';

export function MyDataTable() {
  return (
    <GenericDataTable<MyReportRow>
      useStore={useMyStore}
      useColumnStore={useMyColumnStore}
      metricColumns={MY_METRIC_COLUMNS}
      columnGroups={MY_COLUMN_GROUPS}
      colorClassName={styles.myColors}
      showColumnTooltips={false}
    />
  );
}
```

### Step 7: Create URL Sync Hook
**File**: `hooks/useMyUrlSync.ts`

```typescript
import { useGenericUrlSync } from './useGenericUrlSync';
import { useMyStore } from '@/stores/myStore';
import { fetchMyData } from '@/lib/api/myClient';
import type { MyReportRow } from '@/types/myReport';

export function useMyUrlSync() {
  return useGenericUrlSync<MyReportRow>({
    useStore: useMyStore,
    fetchData: fetchMyData,
    defaultSortColumn: 'metric1', // Change to your default
  });
}
```

### Step 8: Create Page Component
**File**: `app/my-report/page.tsx`

```typescript
'use client';
import { useMyUrlSync } from '@/hooks/useMyUrlSync';
import { MyDataTable } from '@/components/my-report/MyDataTable';

export default function MyReportPage() {
  useMyUrlSync(); // Handles URL sync automatically

  return (
    <div>
      <h1>My Report</h1>
      <MyDataTable />
    </div>
  );
}
```

### Step 9: Test
```bash
# Check for type errors
npm run build

# Test in browser
npm run dev

# Verify:
# - Data loads correctly
# - Filters work (dimensions, date range)
# - Sorting works
# - Expand/collapse works
# - URL updates on filter changes
```

## Common Issues

### Issue: Columns render wrong width
**Cause**: Using `scroll={{ x: 'max-content' }}` with grouped columns
**Solution**: Calculate exact width: `scroll={{ x: 350 + totalMetricWidth }}`

### Issue: Data not loading
**Check**:
1. API route returns `{ success: true, data: [...] }`
2. Store `loadData()` calls correct endpoint
3. Database query uses correct placeholders ($1 for PostgreSQL, ? for MariaDB)

### Issue: URL not updating
**Check**:
1. `useMyUrlSync()` is called in page component
2. Hook uses correct store
3. Store actions update active state (not just loaded state)

## Related Documentation
- See `.claude/rules/components/generic-table.md` for GenericDataTable details
- See `.claude/rules/components/url-sync.md` for URL sync pattern
- See `.claude/rules/components/store-pattern.md` for store implementation
- See `.claude/docs/api.md` for API patterns
- See `.claude/docs/state.md` for state management details
