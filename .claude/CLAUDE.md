# Vitaliv Analytics Dashboard

Marketing analytics dashboard for visualizing performance metrics across dimensions (campaigns, ad groups, keywords, dates). Users drill down hierarchical data, apply filters, and analyze KPIs.

**Stack**: Next.js 16 + React 19 + TypeScript + Ant Design + Tailwind + Zustand + Neon DB

## Table of Contents

1. [Architecture](#architecture) - Project structure
2. [Quick Reference](#quick-reference) - API, State, Design, CSS patterns
3. [Generic Components](#generic-components--patterns) - Reusable components (REVIEW FIRST)
4. [Styling Strategy](#styling-strategy) - Ant + CSS Modules + Tailwind
5. [State Management](#state-zustand) - Zustand stores
6. [Key Patterns](#key-patterns) - Tables, Filters, Cards
7. [Common Workflows](#common-workflows) - Step-by-step guides
8. [Code Conventions](#code-conventions) - Naming, imports, React 19
9. [Documentation](#documentation) - Deep dive docs
10. [Working Principles](#working-principles) - Design principles

---

## Design Direction

**Data-Forward Professional Tool** — Clarity over decoration. Inspired by Linear, Stripe, Vercel.

- Information density: 4px base spacing for large datasets
- Subtle depth: Borders and soft shadows, minimal decoration
- Monochrome base: Gray-scale (#fafbfc → #111827) + #00B96B brand accent
- Hierarchical tables: Fixed columns, drill-down expansion (20px indent/level)

**Design Tokens**: `styles/tokens.ts` (TypeScript) + `styles/tokens.css` (CSS variables)

---

## Architecture

```
app/          - Next.js routes, API endpoints
components/   - table/ (GenericDataTable), filters/, modals/, ui/
hooks/        - useGenericUrlSync, useUrlSync, useOnPageUrlSync
stores/       - reportStore, onPageStore, columnStore, onPageColumnStore
types/        - report.ts, table.ts, dimensions.ts, metrics.ts
styles/       - tokens.ts, tokens.css, theme.ts (Ant Design config)
lib/          - queryBuilder, treeUtils, formatters
.claude/docs/ - Detailed pattern documentation (api, design, state, css, features)
```

**Key Types**: See `types/report.ts` (ReportRow, DateRange), `types/table.ts` (BaseTableRow, GenericDataTableConfig), `types/dimensions.ts`, `types/metrics.ts`

---

## Quick Reference

### API Patterns ([full docs](.claude/docs/api.md))

| Pattern | PostgreSQL (Neon) | MariaDB (CRM) |
|---------|-------------------|---------------|
| **Placeholders** | `$1, $2, $3` | `?, ?, ?` |
| **Import** | `import { db } from '@/lib/server/db'` | `import { executeMariaDBQuery } from '@/lib/server/mariadb'` |
| **Response** | `{ success: true, data: [...] }` OR `{ success: false, error: "msg" }` | Same |
| **Hierarchical Keys** | `parent::child::value` format (use `::` separator) | Same |
| **Dimension Order** | Array position = hierarchy depth (order matters) | Same |

**Quick Template**:
```typescript
// API route
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await db.query('SELECT * FROM table WHERE id = $1', [body.id]);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

---

### State Patterns ([full docs](.claude/docs/state.md))

| Concept | Explanation | Example |
|---------|-------------|---------|
| **Dual-State** | Active (user editing) vs Loaded (server truth). Only "Load Data" button syncs. | `dimensions` vs `loadedDimensions` |
| **URL Sync** | Filters persist in URL. Shareable, bookmarkable. | `?start=2024-01-01&dimensions=campaign,adGroup` |
| **Persistence** | Only `columnStore` persists (localStorage). `reportStore` fetches fresh. | Column visibility saved, data not saved |
| **Store Independence** | No inter-store imports. Components orchestrate. | Page imports both stores, orchestrates logic |

**Store Types**:
- **reportStore** / **onPageStore**: Data, filters, loading (NOT persisted)
- **columnStore** / **onPageColumnStore**: Column visibility/order (persisted to localStorage)

---

### Design Patterns ([full docs](.claude/docs/design.md))

**Tables**:
- Structure: Two-row headers (groups + columns), fixed "Attributes" column (left)
- Hierarchy: 20px indent per depth level, ▶/▼ icons
- Hover: `#f0f9ff`, Expanded: `#e6f7ed`
- Numbers: `tabular-nums` (NOT monospace)

**Filters**:
- Layout: Draggable pills (left) + date picker + "Load Data" button (right)
- Only "Load Data" triggers fetch (not dimension/date changes)
- Gaps: 12px between elements

**Component Library Split**:
| Use Case | Library | Examples |
|----------|---------|----------|
| Data-heavy | Ant Design | Table, Form, DatePicker, Select, Modal |
| Layout/Structural | shadcn/ui | Sidebar, Card, Dialog, Tabs |
| Custom | CSS Modules + Tailwind | Unique UI needs |

---

### CSS Patterns ([full docs](.claude/docs/css.md))

**Styling Strategy** (hybrid approach):
1. **Ant Design Theme** (`styles/theme.ts`) - Customize Ant components globally
2. **CSS Modules** (`*.module.css`) - Component-specific styles
3. **Tailwind** - Layout and spacing utilities
4. **CSS Variables** (`styles/tokens.css`) - Access design tokens in CSS

**Design Tokens** (never hardcode):
```css
/* Colors */
--color-bg-primary: #ffffff;
--color-border: #e8eaed;
--color-accent: #00B96B;

/* Spacing */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 12px;
--spacing-lg: 16px;

/* Radius */
--radius-sm: 4px;
--radius-md: 8px;

/* Shadow */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px rgba(0,0,0,0.07);
```

**Ant Override Pattern**:
```css
/* MyComponent.module.css */
.wrapper :global(.ant-table) {
  background: var(--color-bg-secondary) !important;
}
```

---

## Generic Components & Patterns

**CRITICAL**: Before building ANY feature, review these components. 90% of dashboard features use these.

### 1. GenericDataTable - Hierarchical Tables

**Location**: `components/table/GenericDataTable.tsx`

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

**Template** (copy-paste):
```typescript
// 1. Create types (extend BaseTableRow)
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
  };
}

// 2. Create column config
import type { MetricColumn, ColumnGroup } from '@/types';

const METRIC_COLUMNS: MetricColumn[] = [
  {
    id: 'metric1',
    label: 'Metric 1',
    shortLabel: 'M1',
    description: 'Description for tooltip',
    format: 'number', // 'number' | 'percentage' | 'currency' | 'decimal' | 'time'
    category: 'basic',
    defaultVisible: true,
    width: 120,
    align: 'right',
  },
];

const COLUMN_GROUPS: ColumnGroup[] = [
  { title: 'Group Name', metricIds: ['metric1', 'metric2'] },
];

// 3. Create wrapper component
import { GenericDataTable } from '@/components/table/GenericDataTable';
import { useMyStore } from '@/stores/myStore';
import { useMyColumnStore } from '@/stores/myColumnStore';

export function MyDataTable() {
  return (
    <GenericDataTable<MyReportRow>
      useStore={useMyStore}
      useColumnStore={useMyColumnStore}
      metricColumns={METRIC_COLUMNS}
      columnGroups={COLUMN_GROUPS}
      colorClassName={styles.myColors}
      showColumnTooltips={false}
    />
  );
}
```

**Examples**: [DataTable.tsx](components/table/DataTable.tsx:15), [OnPageDataTable.tsx](components/on-page-analysis/OnPageDataTable.tsx:15)

---

### 2. useGenericUrlSync - URL State Persistence

**Location**: `hooks/useGenericUrlSync.ts`

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

**Template** (copy-paste):
```typescript
// 1. Create wrapper hook
import { useGenericUrlSync } from './useGenericUrlSync';
import { useMyStore } from '@/stores/myStore';
import { fetchMyData } from '@/lib/api/myClient';
import type { MyReportRow } from '@/types/myReport';

export function useMyUrlSync() {
  return useGenericUrlSync<MyReportRow>({
    useStore: useMyStore,
    fetchData: fetchMyData,
    defaultSortColumn: 'myDefaultMetric', // Change this
  });
}

// 2. Use in page component
'use client';
import { useMyUrlSync } from '@/hooks/useMyUrlSync';

export default function MyPage() {
  useMyUrlSync(); // Handles everything automatically
  return <MyDataTable />;
}
```

**URL Format**: `?start=YYYY-MM-DD&end=YYYY-MM-DD&dimensions=a,b&sortBy=col&expanded=key1,key2`

**Examples**: [useUrlSync.ts](hooks/useUrlSync.ts:6), [useOnPageUrlSync.ts](hooks/useOnPageUrlSync.ts:6)

---

### 3. Store Pattern - Report Data Management

**Decision Tree**:
```
Need new report/dashboard? → YES
  ↓
Similar to existing reportStore or onPageStore? → YES
  ↓
→ COPY existing store, change domain-specific logic
```

**Template** (copy-paste from reportStore.ts):
```typescript
import { create } from 'zustand';
import type { MyReportRow } from '@/types/myReport';

interface MyStoreState {
  // Data
  reportData: MyReportRow[];
  loadedDimensions: string[];
  loadedDateRange: { start: Date; end: Date };

  // UI State (active = user editing, loaded = server truth)
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
  // ... implement actions (see reportStore.ts for full example)
}));
```

**Examples**: [reportStore.ts](stores/reportStore.ts:1), [onPageStore.ts](stores/onPageStore.ts:1)

---

### When Building New Features - Checklist

**Step 1: Review** (5 minutes)
- [ ] Search for existing component: `grep -r "similar pattern" .`
- [ ] Check if GenericDataTable applies (hierarchical table?)
- [ ] Check if useGenericUrlSync applies (shareable state?)
- [ ] Review similar features: DataTable, OnPageDataTable

**Step 2: Decide** (2 minutes)
- [ ] Can reuse generic? → Create thin wrapper (preferred)
- [ ] 80%+ similar? → Use/extend generic
- [ ] Truly unique? → Build custom (document why in PR)

**Step 3: Implement** (varies)
- [ ] Copy template from above
- [ ] Customize domain-specific logic only
- [ ] Test with real data

**Step 4: Document** (5 minutes)
- [ ] Update `.claude/docs/` if new pattern
- [ ] Add usage example to CLAUDE.md
- [ ] Update Common Workflows if needed

---

## Styling Strategy

**Hybrid approach** - Use the right tool for the job:
1. **Ant Design Theme** (`styles/theme.ts`) - Customize Ant components
2. **CSS Modules** (`*.module.css`) - Component-specific styles
3. **Tailwind** - Layout, spacing utilities
4. **CSS Variables** (`styles/tokens.css`) - Token access in CSS

**Component Preferences**:
- Ant Design: Tables, forms, date pickers, data-heavy components
- shadcn/ui: Sidebar, layout primitives, structural components

---

## State (Zustand)

**Report Stores** (follow same pattern - see reportStore/onPageStore for examples)
- **reportStore** - Marketing campaign data
- **onPageStore** - Website visitor behavior data
- Common state: `reportData`, `loadedDimensions`, `dateRange`, `expandedRowKeys`, `isLoading`, `hasUnsavedChanges`
- Common actions: `loadData()`, `loadChildData()`, `setDimensions()`, `setDateRange()`, `setSort()`
- **Pattern**: Domain-specific stores with identical structure (98% same implementation)

**Column Stores** (visibility and ordering)
- **columnStore** - For marketing reports
- **onPageColumnStore** - For on-page analysis
- State: `visibleColumns`, `columnOrder`
- Actions: `toggleColumn()`, `reorderColumns()`, `resetColumns()`

**Store Usage with Generics**:
- GenericDataTable accepts any store matching `TableStore<TRow>` interface
- useGenericUrlSync accepts any store matching `StoreHook<TRow>` type
- See `types/table.ts` for generic store interfaces

**API**: POST /api/reports/query, POST /api/on-page-analysis/query (dimensions, dateRange, parentKey → ReportRow[])

---

## Key Patterns

**Tables** (Use GenericDataTable - see Generic Components section)
- Fixed "Attributes" column (left), grouped metric headers
- Expandable rows (▶/▼ icons), lazy child loading, drag scrolling
- Hover: #f0f9ff, Expanded: #e6f7ed, 20px indent per depth
- Two-row headers for grouped columns

**Filters** (FilterToolbar.tsx)
- Left: Dimension pills (#00B96B, draggable via dnd-kit)
- Right: Date picker + "Load Data" button
- 12px gaps, sticky position

**URL State** (Use useGenericUrlSync - see Generic Components section)
- All filter state persists in URL for sharing/bookmarking
- Format: `?start=YYYY-MM-DD&end=YYYY-MM-DD&dimensions=a,b&sortBy=col&expanded=keys`

**Cards/Modals**
- White bg, 1px #e8eaed border, 8px radius, md shadow
- Padding: 12px (compact) or 16px (comfortable)

---

## Common Workflows

### Workflow 1: Build New Dashboard/Report Page

**Time**: ~2-3 hours | **Files**: 7-8 new files

```bash
# Step 1: Review (5 min)
grep -r "GenericDataTable" components/
grep -r "useGenericUrlSync" hooks/

# Step 2: Create types (10 min)
# types/myReport.ts
export interface MyReportRow extends BaseTableRow {
  key: string;
  attribute: string;
  depth: number;
  metrics: { metric1: number; metric2: number };
}

# Step 3: Create column config (15 min)
# config/myColumns.ts
export const MY_METRIC_COLUMNS: MetricColumn[] = [...]
export const MY_COLUMN_GROUPS: ColumnGroup[] = [...]

# Step 4: Create store (30 min - copy reportStore.ts)
# stores/myStore.ts
export const useMyStore = create<MyStoreState>((set, get) => ({...}))

# Step 5: Create API route (30 min)
# app/api/my-report/query/route.ts
export async function POST(request: Request) {
  const { dimensions, dateRange, parentKey } = await request.json();
  // Query database, return { success: true, data: [...] }
}

# Step 6: Create wrapper components (15 min)
# components/my-report/MyDataTable.tsx
export function MyDataTable() {
  return <GenericDataTable<MyReportRow> ... />
}

# hooks/useMyUrlSync.ts
export function useMyUrlSync() {
  return useGenericUrlSync<MyReportRow>({...})
}

# Step 7: Create page (10 min)
# app/my-report/page.tsx
'use client';
export default function MyReportPage() {
  useMyUrlSync();
  return <MyDataTable />;
}

# Step 8: Test
npm run build  # Check for type errors
npm run dev    # Test in browser
```

---

### Workflow 2: Add Metric Column (Existing Report)

**Time**: ~15 minutes | **Files**: 3-4 files

```typescript
// Step 1: Add to type definition (types/report.ts or types/onPageReport.ts)
export interface ReportRow extends BaseTableRow {
  metrics: {
    existingMetric: number;
    newMetric: number; // ← ADD THIS
  };
}

// Step 2: Add to column config (config/columns.ts or config/onPageColumns.ts)
export const METRIC_COLUMNS: MetricColumn[] = [
  // ... existing columns
  {
    id: 'newMetric',
    label: 'New Metric Full Name',
    shortLabel: 'Short',
    description: 'Tooltip description',
    format: 'number', // or 'percentage', 'currency', 'decimal', 'time'
    category: 'basic',
    defaultVisible: true,
    width: 120,
    align: 'right',
  },
];

// Step 3: Update query builder (lib/server/queryBuilder.ts or onPageQueryBuilder.ts)
const query = `
  SELECT
    ${groupByColumns},
    SUM(existing_metric) as existing_metric,
    SUM(new_metric_column) as new_metric  -- ← ADD THIS
  FROM table
  GROUP BY ${groupByColumns}
`;

// Step 4: (Optional) Update default visible columns (stores/columnStore.ts)
visibleColumns: ['existingMetric', 'newMetric'], // ← Add 'newMetric' if default visible

// Step 5: Test
// Build and verify column appears in table
```

---

### Workflow 3: Add Dimension (Existing Report)

**Time**: ~20 minutes | **Files**: 3 files

```typescript
// Step 1: Add to available dimensions (types/dimensions.ts)
export const AVAILABLE_DIMENSIONS = [
  { id: 'campaign', label: 'Campaign', dbColumn: 'campaign_name' },
  { id: 'newDim', label: 'New Dimension', dbColumn: 'new_dim_column' }, // ← ADD
] as const;

// Step 2: Update query builder GROUP BY logic (lib/server/queryBuilder.ts)
function buildGroupByClause(dimensions: string[]): string {
  const columnMap: Record<string, string> = {
    campaign: 'campaign_name',
    adGroup: 'ad_group_name',
    newDim: 'new_dim_column', // ← ADD THIS
  };
  return dimensions.map(dim => columnMap[dim]).join(', ');
}

// Step 3: Add to dimension picker dropdown (components/filters/DimensionPicker.tsx)
const dimensionOptions = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'newDim', label: 'New Dimension' }, // ← ADD THIS
];

// Step 4: Test
// Verify dimension appears in picker and data loads correctly
```

---

### Workflow 4: Create Standalone Component

**Time**: ~30-60 minutes | **When**: Generics don't apply (not a table/report)

```bash
# Step 1: Check existing components (5 min)
find components/ -name "*.tsx" | xargs grep -l "similar pattern"

# Step 2: Decide library
# - Ant Design: Forms, dropdowns, date pickers, modals
# - shadcn/ui: Sidebar, dialogs, cards, layout primitives
# - Custom: Unique UI needs

# Step 3: Create component with CSS Module
# components/my-feature/MyComponent.tsx
'use client';
import styles from './MyComponent.module.css';

export function MyComponent() {
  return <div className={styles.container}>...</div>;
}

# components/my-feature/MyComponent.module.css
.container {
  background: var(--color-bg-primary);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
}

# Step 4: Export from index
# components/my-feature/index.ts
export { MyComponent } from './MyComponent';

# Step 5: Use in page
import { MyComponent } from '@/components/my-feature';
```

---

## Code Conventions

- TypeScript strict mode, explicit return types
- React 19: Server Components default, `'use client'` only when needed
- Naming: Components (PascalCase), hooks (useCamelCase), stores (camelStore), CSS classes (camelCase)
- Imports: `@/components`, `@/lib`, `@/hooks`, `@/stores`, `@/types`, `@/styles`

---

## Documentation

Detailed patterns in `.claude/docs/`:
- `api.md` - API routes, database queries, error handling, query builders
- `design.md` - UI components, layouts, visual patterns, component library split
- `state.md` - Zustand stores, persistence, URL sync, loading states
- `css.md` - Styling approach, design tokens, Ant overrides, typography
- `features.md` - Feature-specific implementations (New Orders dashboard, etc.)

**When to read**: Check relevant docs when working in that area (e.g., read `api.md` when building API routes).

---

## Working Principles

1. **Review before building** - **ALWAYS check existing components/patterns first** (See "Generic Components & Patterns")
2. **Don't Repeat Yourself (DRY)** - Reuse GenericDataTable, useGenericUrlSync, and existing patterns
3. **Data tool first** - Prioritize clarity, scannability, density
4. **Hierarchical core** - Expansion/collapse is critical
5. **Follow existing patterns** - Don't introduce new ways without documented reason
6. **Use design tokens** - Never hardcode colors/spacing
7. **Test with real data** - Large numbers, dates, long text
8. **Accessibility** - Keyboard nav, focus states (2px #00B96B outline)

---

## Documentation Maintenance

**IMPORTANT**: These documentation files (`.claude/CLAUDE.md` and `.claude/docs/*.md`) must stay synchronized with the codebase.

**Auto-Update Rule**: When you make changes that affect how we work with this project (new patterns, architectural decisions, conventions), immediately update the relevant documentation file:
- New API patterns → Update `.claude/docs/api.md`
- New UI patterns → Update `.claude/docs/design.md`
- New state patterns → Update `.claude/docs/state.md`
- New styling patterns → Update `.claude/docs/css.md`
- Feature changes → Update `.claude/docs/features.md`
- Core workflow changes → Update `.claude/CLAUDE.md`

Document changes right after implementing them, not later. This ensures documentation never drifts from reality.

---

**Databases**:
- PostgreSQL (Neon): Ad campaign data → `lib/server/db.ts` (uses `$1` placeholders)
- MariaDB: CRM data → `lib/server/mariadb.ts` (uses `?` placeholders)

**Scripts**: `npm run dev`, `npm run build`, `npm run lint`
**Known Issues**: No tests, large bundle (Ant + shadcn), no dark mode, no virtualization

---

## MariaDB Usage

```typescript
import { executeMariaDBQuery } from '@/lib/server/mariadb';

// Query with ? placeholders (not $1)
const data = await executeMariaDBQuery<Type>(
  'SELECT * FROM table WHERE date > ?',
  ['2026-01-01']
);
```

**Key View**: `real_time_subscriptions_view` - Contains subscription, customer, product, and tracking data (24 columns)
**Config**: `.env.local` contains MariaDB credentials (MARIADB_HOST, MARIADB_USER, etc.)
**Test Connection**: Use `testMariaDBConnection()` function from the module
