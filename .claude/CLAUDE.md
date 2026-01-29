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
| **Placeholders** | `$1, $2, $3` (PostgreSQL ONLY) | `?, ?, ?` (MariaDB ONLY) |
| **CRITICAL** | ⚠️ NEVER use `$1` with MariaDB | ⚠️ NEVER use `?` with PostgreSQL |
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

**CRITICAL**: Before building ANY feature, review these components. Most dashboard features use these.

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

**Step 1: Review** (Do this BEFORE any other steps)

**When to review:** Immediately after receiving the task, before reading files or planning.

**Actions:**
- [ ] Search for existing component matching ANY of these similarity criteria:
  - **Same data structure:** Hierarchical rows, expandable tables
  - **Same interaction:** Drill-down, filtering, sorting
  - **Same domain:** Reports, analytics, dashboards
  - **Same UI pattern:** Two-row headers, fixed columns, grouped metrics

**Search commands:**
```bash
# Search by component type
grep -r "GenericDataTable" components/
grep -r "useGenericUrlSync" hooks/

# Search by feature
grep -r "expandable" components/
grep -r "hierarchical" components/

# Search by domain
find . -name "*Report*" -o -name "*Analysis*"
```

- [ ] Check if GenericDataTable applies (hierarchical table?)
- [ ] Check if useGenericUrlSync applies (shareable state?)
- [ ] Review similar features: DataTable, OnPageDataTable

**Stop and use existing patterns if found** - Do not proceed to Step 2 if generic applies.

**Step 2: Decide**
- [ ] Can reuse generic? → Create thin wrapper (preferred)
- [ ] Calculate similarity score using this checklist (each = 20%):

  **Similarity Checklist (5 items = 100%):**
  1. [ ] Same data structure (hierarchical rows with children) = 20%
  2. [ ] Same interactions (expand/collapse, sorting, filtering) = 20%
  3. [ ] Same column structure (attributes + metric groups) = 20%
  4. [ ] Same state management needs (URL sync, persistence) = 20%
  5. [ ] Same loading patterns (parent data + lazy children) = 20%

  **Decision:**
  - 80-100% (4-5 checkboxes): Use/extend generic ✅
  - 60-80% (3 checkboxes): Strongly consider generic with customization
  - 40-60% (2 checkboxes): Evaluate case-by-case
  - 0-40% (0-1 checkboxes): Build custom component

- [ ] Truly unique? → Build custom (document why in PR)

**Step 3: Implement**
- [ ] Copy template from above
- [ ] Customize domain-specific logic only
- [ ] Test with real data

**Step 4: Document**
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

**"Load Data" Button Behavior** (Canonical Definition)

**What it does (in order):**
1. Validates active filters (dimensions, date range)
2. Calls `loadData()` from store
3. Fetches data from API via POST /api/reports/query (or equivalent)
4. Updates `reportData` in store (replaces existing data)
5. Syncs active → loaded state:
   - `loadedDimensions` = `dimensions`
   - `loadedDateRange` = `dateRange`
6. Sets `hasUnsavedChanges` = false
7. Updates URL with new filter state
8. Clears `expandedRowKeys` (collapse all rows)

**What triggers it:**
- ✅ User clicks "Load Data" button
- ❌ NOT triggered by dimension/date changes (those only update active state)
- ❌ NOT triggered by URL changes on page load (useUrlSync handles that)

**Visual feedback:**
- Button shows loading spinner during fetch
- Button disabled while loading
- Button highlighted (green #00B96B) when hasUnsavedChanges = true

**URL State** (Use useGenericUrlSync - see Generic Components section)
- All filter state persists in URL for sharing/bookmarking
- Format: `?start=YYYY-MM-DD&end=YYYY-MM-DD&dimensions=a,b&sortBy=col&expanded=keys`

**Cards/Modals**
- White bg, 1px #e8eaed border, 8px radius, md shadow
- Padding: 12px (compact) or 16px (comfortable)

---

## Common Workflows

### Workflow 1: Build New Dashboard/Report Page

**Files**: 7-8 new files

```bash
# Step 1: Review
grep -r "GenericDataTable" components/
grep -r "useGenericUrlSync" hooks/

# Step 2: Create types
# types/myReport.ts
export interface MyReportRow extends BaseTableRow {
  key: string;
  attribute: string;
  depth: number;
  metrics: { metric1: number; metric2: number };
}

# Step 3: Create column config
# config/myColumns.ts
export const MY_METRIC_COLUMNS: MetricColumn[] = [...]
export const MY_COLUMN_GROUPS: ColumnGroup[] = [...]

# Step 4: Create store (copy reportStore.ts)
# stores/myStore.ts
export const useMyStore = create<MyStoreState>((set, get) => ({...}))

# Step 5: Create API route
# app/api/my-report/query/route.ts
export async function POST(request: Request) {
  const { dimensions, dateRange, parentKey } = await request.json();
  // Query database, return { success: true, data: [...] }
}

# Step 6: Create wrapper components
# components/my-report/MyDataTable.tsx
export function MyDataTable() {
  return <GenericDataTable<MyReportRow> ... />
}

# hooks/useMyUrlSync.ts
export function useMyUrlSync() {
  return useGenericUrlSync<MyReportRow>({...})
}

# Step 7: Create page
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

**Files**: 3-4 files

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

**Files**: 3 files

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

**When**: Generics don't apply (not a table/report)

```bash
# Step 1: Check existing components
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

**Import Path Rules:**

Always use absolute paths with @ alias:
```typescript
// ✅ CORRECT
import { Button } from '@/components/ui/button';
import { useReportStore } from '@/stores/reportStore';
import type { ReportRow } from '@/types/report';

// ❌ WRONG - relative paths
import { Button } from '../../../components/ui/button';
import { useReportStore } from '../../stores/reportStore';
```

**Exception:** Same directory imports can use relative
```typescript
// File: components/table/DataTable.tsx
import { GenericDataTable } from './GenericDataTable';  // OK - same dir
```

**Why absolute paths?**
- Easier to move files (paths don't break)
- Clearer to read (know exact location)
- TypeScript autocomplete works better

---

## Development Workflow

### File Edit Permissions

**Rule**: Ask for permission ONCE per file per editing session

**What is an "editing session"?**
- Starts: When you first mention needing to edit a file
- Ends: When you commit changes OR switch to different task
- Permission valid for: All related edits within that session

**Edge cases:**
- Edit → Commit → Edit again = NEW session (ask again)
- Edit 100 times before commit = SAME session (no re-ask)
- Edit file A, switch to file B, return to file A = NEW session (ask again)

**Pattern**:
```
✅ GOOD: One session with multiple edits
"I'll make 3 edits to CLAUDE.md" → [makes 3 edits] → commit → done

✅ GOOD: Multiple sessions with explicit re-asking
Session 1: "I'll edit CLAUDE.md" → edit → commit
Session 2: "I need to edit CLAUDE.md again" → edit → commit

❌ BAD: Re-asking within same session
"Edit CLAUDE.md (1/3)" → [permission prompt]
"Edit CLAUDE.md (2/3)" → [permission prompt] ← unnecessary
```

---

### When to Run Builds

**Rule**: Only run `npm run build` after **code changes**, never after **documentation changes**

| Change Type | Examples | Run Build? |
|-------------|----------|-----------|
| **TypeScript/JavaScript** | `.ts`, `.tsx`, `.js`, `.jsx` files | ✅ YES |
| **Styles** | `.css`, `.module.css` files | ✅ YES |
| **Config** | `package.json`, `tsconfig.json`, `.env` | ✅ YES |
| **Documentation** | `.md` files, comments only | ❌ NO |
| **Assets** | Images, fonts, static files | ❌ NO |

**Clarification:**
- CSS files are CODE, not documentation → Run build
- Adding CSS comments only → Skip build
- Changing token values in `tokens.css` → Run build (affects compilation)

**Decision Tree**:
```
Made changes? → YES
  ↓
Changed any .ts/.tsx/.js/.jsx files? → NO
  ↓
Changed any .css files? → NO
  ↓
Changed package.json or configs? → NO
  ↓
→ SKIP BUILD (docs/assets only)
```

**Build Verification - Objective Rules:**

**Run build if you changed ANY of these:**
1. ✅ Added/removed/renamed any .ts/.tsx/.js/.jsx file
2. ✅ Changed any function signature (parameters, return type)
3. ✅ Modified imports/exports in any file
4. ✅ Changed package.json dependencies
5. ✅ Modified tsconfig.json or next.config.js
6. ✅ Changed any .css file (including tokens)
7. ✅ Modified environment variables in .env

**Skip build if you ONLY changed:**
1. ❌ Markdown files (.md)
2. ❌ Comments in code (// or /* */)
3. ❌ Console.log statements (for debugging)
4. ❌ README or documentation
5. ❌ Git-related files (.gitignore)

**When truly uncertain:** Run the build (safer to over-build than under-build)

---

### Git Commit & Push Strategy

**CRITICAL RULE: NEVER push to remote without explicit user permission**

**Why this is CRITICAL:** Auto-pushing can:
- Expose unfinished work to team members
- Trigger CI/CD pipelines prematurely
- Break production deployments
- Violate user's workflow expectations
- Cannot be undone easily (requires force push)

Unlike other rules which affect code quality, violating this rule has immediate external consequences.

---

**When to Commit** (automatic):
- After completing a logical unit of work
- After fixing a bug
- After adding a feature
- After documentation updates

**When to Push** (ALWAYS ask first):
- ⛔ **NEVER auto-push** - regardless of number of commits
- ⛔ **NEVER push without asking** - even after batching multiple commits
- ✅ **ALWAYS ask before EVERY push** - no exceptions
- ✅ "Commit" means create local commit only - NEVER includes push
- ✅ If user says "commit and push", ask for confirmation before push step
- ✅ Each new session starts with NO push permission - must ask again
- ✅ Emergency hotfix = still ask before push

**Clarification:**
- User saying "commit this" = create local commit only
- User saying "push" or "commit and push" = ask for confirmation first
- Never assume permission carries across sessions

**Pattern**:
```bash
# ✅ CORRECT: Commits are automatic, but push ALWAYS requires permission
git commit -m "feat: Add GenericDataTable"
git commit -m "docs: Update CLAUDE.md with table patterns"
git commit -m "fix: Type error in store"
# → STOP HERE
# → ASK USER: "I've made 3 commits. Would you like me to push them now?"
# → WAIT for user response
# → Only push if user explicitly approves

# ❌ WRONG: Never do this
git commit && git push  # ← NEVER auto-push
git commit -m "..." && git push  # ← NEVER chain push with commit
# Push after N commits without asking  # ← NEVER push based on commit count
```

**Required Ask Pattern**:
```
"I've committed [description]. There are now [N] unpushed commits.
Would you like me to push them to remote now?"

Options:
1. Yes, push now
2. No, I'll push later
```

**Important:**
- Commits can happen automatically after completing work
- Push MUST ALWAYS be approved by user first
- No threshold or batch size should trigger automatic push
- User must explicitly say "yes" or "push" before running git push

---

### Creating Pull Requests

**When to create PR:**
- Feature is complete (not mid-development)
- All tests passing (if applicable)
- Code committed to feature branch
- User explicitly requests PR creation

**Workflow:**
```bash
# 1. Ensure on feature branch
git branch  # Verify not on main

# 2. Commit all changes
git add .
git commit -m "feat: Description"

# 3. Push to remote
git push -u origin feature-branch-name

# 4. Create PR via gh CLI
gh pr create --title "feat: Title" --body "$(cat <<'EOF'
## Summary
- Bullet point summary
- Key changes

## Test plan
- [ ] Test case 1
- [ ] Test case 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Never create PR:**
- ❌ From main branch (create feature branch first)
- ❌ With uncommitted changes
- ❌ Before user approval
- ❌ Mid-development (wait for completion)

**View comments on a Github PR:** `gh api repos/owner/repo/pulls/123/comments`

---

## Documentation

Detailed patterns in `.claude/docs/`:
- `api.md` - API routes, PostgreSQL database queries, error handling, query builders
- `mariadb.md` - **MariaDB CRM database guide** (schema, query patterns, use cases, data quality)
- `design.md` - UI components, layouts, visual patterns, component library split
- `state.md` - Zustand stores, persistence, URL sync, loading states
- `css.md` - Styling approach, design tokens, Ant overrides, typography
- `features.md` - Feature-specific implementations (New Orders dashboard, etc.)

**When to read**: Check relevant docs when working in that area (e.g., read `mariadb.md` when querying CRM database, read `api.md` when building API routes).

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

**Documentation Update Timing (Specific Order):**

1. **Implement the code change** (write/edit files)
2. **Test the change works** (build, run, verify)
3. **Update documentation immediately** (before commit)
4. **Commit code + docs together** (one commit for both)

**Why this order?**
- Ensures docs match code exactly
- Prevents forgetting to document
- Keeps git history clean (code + docs in same commit)
- Makes PR reviews easier

**Do NOT:**
- ❌ Commit code first, docs later (can forget)
- ❌ Document before testing (might change during debugging)
- ❌ Skip docs "for now" (always leads to drift)

**Exception:** If debugging and unsure of final approach, document AFTER solution is stable.

---

**Databases**:
- PostgreSQL (Neon): Ad campaign data → `lib/server/db.ts` (uses `$1` placeholders)
- MariaDB: CRM data → `lib/server/mariadb.ts` (uses `?` placeholders)

**Scripts**: `npm run dev`, `npm run build`, `npm run lint`
**Known Issues**: No tests, large bundle (Ant + shadcn), no dark mode, no virtualization

---

## MariaDB Usage

**For comprehensive MariaDB documentation, see [MariaDB Guide](.claude/docs/mariadb.md).**

The guide includes:
- Full schema reference for 9 tables (subscription, invoice, customer, product, source, etc.)
- UTM parameter mapping for Facebook and Google Ads attribution
- 30+ query patterns with examples
- 16+ real-world use cases (upsells, approvals, validations, customer types)
- Data quality & cleanup patterns
- Performance optimization and error handling

**Quick Reference:**
```typescript
import { executeMariaDBQuery } from '@/lib/server/mariadb';

// Query with ? placeholders (not $1 like PostgreSQL)
const data = await executeMariaDBQuery<Type>(
  'SELECT * FROM table WHERE date > ? AND deleted = 0',
  ['2026-01-01']
);
```

**Key Concepts:**
- Uses `?` placeholders (not `$1, $2, $3` like PostgreSQL)
- Connection pooling with 10 concurrent connections
- 30-second timeout for VPN/remote connections
- Always filter `deleted = 0` to exclude soft-deleted records
- Upsells linked via `tag` field: `tag LIKE '%parent-sub-id=X%'`
- Approval status: `is_marked = 1` means approved
- Trial conversion: `invoice_proccessed.date_bought IS NOT NULL`
- UTM parameters: `utm_source` → `source` table, `utm_medium/content/term/campaign` → `tracking_id_1/2/3/4`

**Config**: `.env.local` contains MariaDB credentials (MARIADB_HOST, MARIADB_USER, etc.)
**Test Connection**: Use `testMariaDBConnection()` function from `@/lib/server/mariadb`
