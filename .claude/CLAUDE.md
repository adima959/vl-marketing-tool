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

**API Patterns** ([details](.claude/docs/api.md)):
- Response format: `{ success, data, error }` envelope
- Database clients: PostgreSQL (`$1`) vs MariaDB (`?`) - never mix
- Hierarchical keys: `parent::child::value` format
- Dimension order: array position = hierarchy depth

**State Patterns** ([details](.claude/docs/state.md)):
- Dual-state: active (editing) vs loaded (server truth)
- URL sync: filters persist in URL params for shareability
- Persistence: columnStore only, not reportStore (data fetched fresh)
- Store independence: no inter-store imports, components orchestrate

**Design Patterns** ([details](.claude/docs/design.md)):
- Tables: Two-row headers, 20px indent per depth, fixed layout
- Filters: Draggable pills + date picker + "Load Data" button (only trigger)
- Component split: Ant Design (data) vs shadcn/ui (layout)
- Design tokens: `styles/tokens.css` - never hardcode

**CSS Patterns** ([details](.claude/docs/css.md)):
- Strategy: Ant theme + CSS Modules + Tailwind + CSS variables
- Token categories: color, spacing, radius, shadow, font
- Ant overrides: CSS Modules with :global() + !important
- Table numbers: use `tabular-nums`, not monospace

---

## Generic Components & Patterns

**IMPORTANT**: Before building new features, **ALWAYS review existing generic components** to avoid duplication.

### Available Generic Components:

**GenericDataTable** (`components/table/GenericDataTable.tsx`)
- Type-safe hierarchical table with expand/collapse
- Configurable column groups and tooltips
- Handles: loading, errors, empty states, drag scrolling
- **Use for**: Any report/analytics table with drill-down
- **Example wrappers**: DataTable.tsx, OnPageDataTable.tsx

**useGenericUrlSync** (`hooks/useGenericUrlSync.ts`)
- Syncs Zustand store state with URL query parameters
- Handles: date range, dimensions, sort, expanded rows
- Supports parallel expansion restoration
- **Use for**: Any dashboard page with shareable state
- **Example wrappers**: useUrlSync.ts, useOnPageUrlSync.ts

### When Building New Features:

**REQUIRED STEPS** (follow in order):
1. **Review Existing Components**
   - Check `components/table/GenericDataTable.tsx` for table needs
   - Check `hooks/useGenericUrlSync.ts` for URL sync needs
   - Check existing stores (reportStore, onPageStore) for patterns
   - Search codebase for similar functionality

2. **Plan Reuse Strategy**
   - Can you use GenericDataTable? → Create thin wrapper with config
   - Can you use useGenericUrlSync? → Create wrapper hook
   - Need new generic? → Extract common logic, create generic version
   - Truly unique? → Build custom, but document why

3. **Avoid Duplication**
   - Never copy-paste from existing features
   - Never recreate what generics already provide
   - If 80%+ similar → use/extend generic
   - If creating similar → refactor into generic first

4. **Document Patterns**
   - Update `.claude/docs/` with new patterns
   - Add usage examples to CLAUDE.md
   - Update Common Workflows section

**Code Review Checklist**:
- [ ] Searched for existing components solving this problem
- [ ] Checked if GenericDataTable/useGenericUrlSync apply
- [ ] Reviewed similar features for patterns
- [ ] Planned to reuse (not recreate) existing code
- [ ] Documented any new patterns created

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

**Build New Dashboard/Report Page**
1. **Review existing code first** (See "Generic Components & Patterns" section)
   - Check if GenericDataTable + useGenericUrlSync apply (90% of cases)
   - Review existing stores (reportStore, onPageStore) for patterns
2. Create types: Add to `types/` (extend BaseTableRow if using GenericDataTable)
3. Create column config: Add to `config/` (MetricColumn[], ColumnGroup[])
4. Create store: Follow reportStore pattern (or reuse if same domain)
5. Create API route: Follow `/api/reports/query` pattern
6. Create wrapper components:
   - Table: Thin wrapper around GenericDataTable with config
   - URL sync: Thin wrapper around useGenericUrlSync with store
7. Create page: Use wrappers in `app/[page-name]/page.tsx`

**Add Metric Column (to existing report)**
1. `types/report.ts` - add to `ReportRow['metrics']`
2. `config/columns.ts` - add to `METRIC_COLUMNS`
3. `lib/server/queryBuilder.ts` - update SQL SELECT
4. `columnStore.ts` - update defaults if needed

**Add Dimension (to existing report)**
1. `types/dimensions.ts` - add to `AVAILABLE_DIMENSIONS`
2. `lib/server/queryBuilder.ts` - update GROUP BY logic
3. `DimensionPicker.tsx` - add dropdown option

**Create Standalone Component** (when generics don't apply)
1. **Check existing components first** - search for similar functionality
2. Choose library: Ant Design (data-heavy) vs shadcn/ui (structural) vs custom
3. Custom: Create in `components/`, use CSS Modules + design tokens
4. Add TypeScript types, follow naming conventions

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
