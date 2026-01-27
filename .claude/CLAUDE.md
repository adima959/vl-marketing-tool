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
.claude/docs/ - Detailed pattern documentation (api, design, state, css, features)
```

**Key Types**: See `types/report.ts` (ReportRow, DateRange), `types/dimensions.ts`, `types/metrics.ts`

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

1. **Data tool first** - Prioritize clarity, scannability, density
2. **Hierarchical core** - Expansion/collapse is critical
3. **Follow existing patterns** - Don't introduce new ways
4. **Use design tokens** - Never hardcode colors/spacing
5. **Test with real data** - Large numbers, dates, long text
6. **Accessibility** - Keyboard nav, focus states (2px #00B96B outline)

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
**Deployment**: See `DOCKER_DEPLOYMENT.md`, `PORTAINER_DEPLOYMENT.md`, and `DOCKER_QUICK_START.md`
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
