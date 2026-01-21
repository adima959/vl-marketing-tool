# Vitaliv Analytics Dashboard

Marketing analytics dashboard for visualizing performance metrics across dimensions (campaigns, ad groups, keywords, dates). Users drill down hierarchical data, apply filters, and analyze KPIs.

**Stack**: Next.js 16 + React 19 + TypeScript + Ant Design + Tailwind + Zustand + Neon DB

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
components/   - table/, filters/, modals/, ui/
stores/       - reportStore (data/filters), columnStore (visibility/order)
types/        - report.ts, dimensions.ts, metrics.ts
styles/       - tokens.ts, tokens.css, theme.ts (Ant Design config)
lib/          - queryBuilder, treeUtils
```

**Key Types** (types/report.ts)
```typescript
ReportRow {
  key: string              // Unique ID
  attribute: string        // Dimension value
  depth: number           // Hierarchy level (0-3)
  hasChildren?: boolean
  children?: ReportRow[]
  metrics: { cost, clicks, impressions, conversions, ctr, cpc, ... }
}
```

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

**reportStore** - Report data, filters, loading, expansion
- State: `reportData`, `loadedDimensions`, `dateRange`, `expandedRowKeys`, `isLoading`, `hasUnsavedChanges`
- Actions: `loadData()`, `loadChildData()`, `setDimensions()`, `setDateRange()`, `setSort()`

**columnStore** - Column visibility and ordering
- State: `visibleColumns`, `columnOrder`
- Actions: `toggleColumn()`, `reorderColumns()`, `resetColumns()`

**API**: POST /api/reports/query (dimensions, dateRange, parentKey → ReportRow[])

---

## Key Patterns

**Tables** (DataTable.tsx + CSS Modules)
- Fixed "Attributes" column (left), grouped metric headers
- Expandable rows, lazy child loading
- Hover: #f0f9ff, Expanded: #e6f7ed

**Filters** (FilterToolbar.tsx)
- Left: Dimension pills (#00B96B, draggable)
- Right: Date picker + "Load Data" button
- 12px gaps, sticky position

**Cards/Modals**
- White bg, 1px #e8eaed border, 8px radius, md shadow
- Padding: 12px (compact) or 16px (comfortable)

---

## Common Workflows

**Add Metric Column**
1. `types/report.ts` - add to `ReportRow['metrics']`
2. `config/columns.ts` - add to `METRIC_COLUMNS`
3. `lib/server/queryBuilder.ts` - update SQL SELECT
4. `columnStore.ts` - update defaults if needed

**Add Dimension**
1. `types/dimensions.ts` - add to `AVAILABLE_DIMENSIONS`
2. `lib/server/queryBuilder.ts` - update GROUP BY logic
3. `DimensionPicker.tsx` - add dropdown option

**Create Component**
1. Choose: Ant Design (data-heavy) vs shadcn/ui (structural) vs custom
2. Custom: Create in `components/`, use CSS Modules
3. Import design tokens, add TypeScript types

---

## Code Conventions

- TypeScript strict mode, explicit return types
- React 19: Server Components default, `'use client'` only when needed
- Naming: Components (PascalCase), hooks (useCamelCase), stores (camelStore), CSS classes (camelCase)
- Imports: `@/components`, `@/lib`, `@/hooks`, `@/stores`, `@/types`, `@/styles`

---

## Working Principles

1. **Data tool first** - Prioritize clarity, scannability, density
2. **Hierarchical core** - Expansion/collapse is critical
3. **Follow existing patterns** - Don't introduce new ways
4. **Use design tokens** - Never hardcode colors/spacing
5. **Test with real data** - Large numbers, dates, long text
6. **Accessibility** - Keyboard nav, focus states (2px #00B96B outline)

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
**Test Endpoint**: `GET /api/test-mariadb` - Returns connection status and table list
**Config**: `.env.local` contains MariaDB credentials (MARIADB_HOST, MARIADB_USER, etc.)
