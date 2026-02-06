# Component Template: GenericDataTable

## Overview
GenericDataTable is a reusable component for hierarchical data tables with expand/collapse, multiple metric columns, sorting, and filtering.

## When to Use

**Decision Tree**:
```
Need a table? → YES
  ↓
Hierarchical data with expand/collapse? → YES
  ↓
Multiple metric columns? → YES
  ↓
→ USE GenericDataTable
```

**Indicators**:
- ✅ Data has parent-child relationships
- ✅ Users need to drill down (campaign > ad group > keyword)
- ✅ Multiple numeric metrics to display
- ✅ Need column grouping (Basic Metrics, Advanced Metrics)
- ✅ Need sorting, filtering, column visibility controls

**When NOT to use**:
- ❌ Flat data with no hierarchy
- ❌ Single column or very simple table
- ❌ Custom visualization (charts, graphs)

## Complete Implementation Template

### 1. Create Type Definition

**File**: `types/myReport.ts`

```typescript
import type { BaseTableRow } from '@/types/table';

/**
 * Row data for My Report
 * Extends BaseTableRow to work with GenericDataTable
 */
export interface MyReportRow extends BaseTableRow {
  // REQUIRED FIELDS (GenericDataTable needs these)
  key: string;          // Unique identifier, use format: "parent::child::value"
  attribute: string;    // Display text shown in first column
  depth: number;        // Hierarchy level: 0 = root, 1 = first child, 2 = second child, etc.

  // OPTIONAL FIELDS (for hierarchy)
  hasChildren?: boolean;     // Can this row expand to show children?
  children?: MyReportRow[];  // Child rows (loaded on expand)

  // YOUR CUSTOM FIELDS
  metrics: {
    // Add your metrics here
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;         // Click-through rate
    costPerClick: number;
    // ... more metrics as needed
  };

  // Optional: Add dimension-specific data
  campaignId?: string;
  adGroupId?: string;
  // ... other domain-specific fields
}
```

**Key requirements**:
- Must extend `BaseTableRow`
- `key` must be unique and use `::` separator for hierarchy
- `depth` must start at 0 for root rows
- `metrics` object contains all numeric columns

### 2. Create Column Configuration

**File**: `config/myColumns.ts`

```typescript
import type { MetricColumn, ColumnGroup } from '@/types';

/**
 * Define all metric columns for the table
 * Each column specifies how to display and format the metric
 */
export const MY_METRIC_COLUMNS: MetricColumn[] = [
  {
    id: 'impressions',
    label: 'Impressions',  // Full name shown in header
    shortLabel: 'Impr',    // Short name (optional, for mobile)
    description: 'Total number of times ads were shown', // Tooltip text
    format: 'number',      // Format type (see below)
    category: 'basic',     // Category for grouping
    defaultVisible: true,  // Show by default?
    width: 120,           // Column width in pixels
    align: 'right',       // Text alignment
  },
  {
    id: 'clicks',
    label: 'Clicks',
    shortLabel: 'Clk',
    description: 'Total number of clicks on ads',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 100,
    align: 'right',
  },
  {
    id: 'ctr',
    label: 'Click-Through Rate',
    shortLabel: 'CTR',
    description: 'Percentage of impressions that resulted in clicks',
    format: 'percentage',  // Shows as 12.3%
    category: 'basic',
    defaultVisible: true,
    width: 100,
    align: 'right',
  },
  {
    id: 'costPerClick',
    label: 'Cost Per Click',
    shortLabel: 'CPC',
    description: 'Average cost paid for each click',
    format: 'currency',    // Shows as $1.23
    category: 'advanced',
    defaultVisible: false, // Hidden by default
    width: 120,
    align: 'right',
  },
  {
    id: 'conversions',
    label: 'Conversions',
    shortLabel: 'Conv',
    description: 'Total number of conversions',
    format: 'decimal',     // Shows as 12.34
    category: 'conversion',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
];

/**
 * Define column groups for two-row header
 * Groups related metrics under a common header
 */
export const MY_COLUMN_GROUPS: ColumnGroup[] = [
  {
    title: 'Basic Metrics',
    metricIds: ['impressions', 'clicks', 'ctr']
  },
  {
    title: 'Advanced Metrics',
    metricIds: ['costPerClick']
  },
  {
    title: 'Conversion Metrics',
    metricIds: ['conversions']
  },
];
```

**Format options**:
- `'number'` - Integer with thousand separators (1,234)
- `'percentage'` - Percentage with 1 decimal (12.3%)
- `'currency'` - Dollar amount with cents ($1,234.56)
- `'decimal'` - Number with 2 decimals (12.34)
- `'time'` - Duration in HH:MM:SS format

**Category conventions**:
- `'basic'` - Core KPIs everyone needs
- `'advanced'` - Power user metrics
- `'engagement'` - User interaction metrics
- `'conversion'` - Conversion funnel metrics
- `'financial'` - Cost and revenue metrics

### 3. Create Wrapper Component

**File**: `components/my-report/MyDataTable.tsx`

```typescript
import { GenericDataTable } from '@/components/table/GenericDataTable';
import { useMyStore } from '@/stores/myStore';
import { useMyColumnStore } from '@/stores/myColumnStore';
import { MY_METRIC_COLUMNS, MY_COLUMN_GROUPS } from '@/config/myColumns';
import type { MyReportRow } from '@/types/myReport';
import styles from './MyDataTable.module.css';

/**
 * Data table wrapper for My Report
 * Connects GenericDataTable with domain-specific stores and configuration
 */
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

**Props explained**:
- `useStore` - Zustand store for data and filters
- `useColumnStore` - Zustand store for column visibility
- `metricColumns` - Column definitions
- `columnGroups` - Group headers for two-row layout
- `colorClassName` - CSS module class for colors
- `showColumnTooltips` - Show info icon in headers?

### 4. Create CSS Module

**File**: `components/my-report/MyDataTable.module.css`

```css
/**
 * Custom colors for table rows
 * Use CSS variables from styles/tokens.css
 */
.myColors {
  /* Row background on hover */
  --row-hover-bg: var(--color-hover);

  /* Expanded row background */
  --row-expanded-bg: var(--color-expanded);

  /* Selected row background */
  --row-selected-bg: var(--color-accent-light);
}

/**
 * Optional: Override Ant Design table styles
 */
.myColors :global(.ant-table) {
  font-size: 13px;
}

.myColors :global(.ant-table-thead > tr > th) {
  font-weight: 600;
  background: var(--color-bg-secondary);
}

.myColors :global(.ant-table-tbody > tr.ant-table-row:hover > td) {
  background: var(--row-hover-bg) !important;
}

.myColors :global(.ant-table-tbody > tr.ant-table-row-expanded > td) {
  background: var(--row-expanded-bg) !important;
}
```

### 5. Usage in Page

**File**: `app/my-report/page.tsx`

```typescript
'use client';
import { MyDataTable } from '@/components/my-report/MyDataTable';
import { useMyUrlSync } from '@/hooks/useMyUrlSync';

export default function MyReportPage() {
  // Initialize URL sync (handles filters, sort, expanded rows)
  useMyUrlSync();

  return (
    <div>
      <h1>My Report</h1>
      {/* Add filters, date picker, etc. here */}
      <MyDataTable />
    </div>
  );
}
```

## Props Reference

### GenericDataTable Props

```typescript
interface GenericDataTableProps<TRow extends BaseTableRow> {
  // REQUIRED
  useStore: () => TableStore<TRow>;
  useColumnStore: () => ColumnStore;
  metricColumns: MetricColumn[];
  columnGroups: ColumnGroup[];

  // OPTIONAL
  colorClassName?: string;
  showColumnTooltips?: boolean;
  onRowClick?: (record: TRow) => void;
  onRowExpand?: (expanded: boolean, record: TRow) => void;
  customActions?: (record: TRow) => React.ReactNode;
}
```

### MetricColumn Fields

```typescript
interface MetricColumn {
  id: string;                    // Matches property in MyReportRow.metrics
  label: string;                 // Full display name
  shortLabel?: string;           // Short name for mobile
  description?: string;          // Tooltip text
  format: MetricFormat;          // How to display value
  category: string;              // For grouping/filtering
  defaultVisible: boolean;       // Show by default?
  width: number;                 // Column width in pixels
  align: 'left' | 'center' | 'right';
  sortable?: boolean;            // Allow sorting? (default: true)
}
```

## Common Customizations

### Custom Cell Rendering

```typescript
<GenericDataTable<MyReportRow>
  {...props}
  renderCell={(value, record, column) => {
    if (column.id === 'campaignName') {
      return <a href={`/campaign/${record.campaignId}`}>{value}</a>;
    }
    return value;
  }}
/>
```

### Custom Row Actions

```typescript
<GenericDataTable<MyReportRow>
  {...props}
  customActions={(record) => (
    <Space>
      <Button size="small" onClick={() => handleEdit(record)}>
        Edit
      </Button>
      <Button size="small" onClick={() => handleDelete(record)}>
        Delete
      </Button>
    </Space>
  )}
/>
```

### Custom Row Styling

```typescript
<GenericDataTable<MyReportRow>
  {...props}
  rowClassName={(record) => {
    if (record.metrics.ctr > 5) return styles.highPerformance;
    if (record.metrics.ctr < 1) return styles.lowPerformance;
    return '';
  }}
/>
```

> See CLAUDE.md "Critical Warnings" for the table scroll width bug.

## Real-World Examples

### Example 1: Marketing Report (DataTable.tsx)
- Hierarchy: Campaign > Ad Group > Keyword
- Metrics: Impressions, clicks, CTR, cost, conversions
- Features: Date range, dimension filters, column visibility
- Location: [components/table/DataTable.tsx](components/table/DataTable.tsx)

### Example 2: On-Page Analysis (OnPageDataTable.tsx)
- Hierarchy: Page > Section > Element
- Metrics: Views, clicks, engagement time, bounce rate
- Features: Similar to marketing report
- Location: [components/on-page-analysis/OnPageDataTable.tsx](components/on-page-analysis/OnPageDataTable.tsx)

## Related Documentation
- See `.claude/docs/workflows/new-dashboard.md` for complete workflow
- See `.claude/docs/components/url-sync.md` for URL sync pattern
- See `.claude/docs/components/store-pattern.md` for store implementation
- See `.claude/docs/design.md` for table styling guidelines
- See `types/table.ts` for all TypeScript interfaces
