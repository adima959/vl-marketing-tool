# Project Overview

## Design Direction

**Data-Forward Professional Tool** — Clarity over decoration. Inspired by Linear, Stripe, Vercel.

- Information density: 4px base spacing
- Subtle depth: Borders and soft shadows
- Monochrome + #00B96B accent
- Hierarchical tables: 20px indent/level

**Tokens**: `styles/tokens.ts` + `styles/tokens.css`

```css
--color-bg-primary: #ffffff;    --spacing-xs: 4px;
--color-border: #e8eaed;        --spacing-sm: 8px;
--color-accent: #00B96B;        --spacing-md: 12px;
--radius-sm: 4px;               --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
```

## Architecture

```
app/          - Next.js routes, API endpoints
components/   - table/ (GenericDataTable), filters/, modals/, ui/
hooks/        - useGenericUrlSync, useUrlSync, useOnPageUrlSync
stores/       - reportStore, onPageStore, columnStore, onPageColumnStore
types/        - report.ts, table.ts, dimensions.ts, metrics.ts
lib/          - queryBuilder, treeUtils, formatters
```

## Component Library Split

| Use Case | Library | Examples |
|----------|---------|----------|
| Data-heavy | Ant Design | Table, Form, DatePicker, Modal |
| Layout | shadcn/ui | Sidebar, Card, Dialog, Tabs |
| Custom | CSS Module + Tailwind | Unique UI |

## API Patterns

| Pattern | PostgreSQL | MariaDB |
|---------|-----------|---------|
| **Response** | `{ success: true, data: [...] }` | Same |
| **Keys** | `parent::child::value` (use `::`) | Same |

Full details: `docs/api.md` | MariaDB: `docs/mariadb.md`

## State Patterns

| Pattern | Explanation |
|---------|-------------|
| **Dual-State** | Active (editing) vs Loaded (server truth) |
| **URL Sync** | Filters persist in URL |
| **Persistence** | Only `columnStore` persists (localStorage) |

Full details: `docs/state.md`

## Generic Components (Review BEFORE Building)

**GenericDataTable**: Hierarchical data + expand/collapse + multiple metrics → USE GenericDataTable
- Template: `docs/components/generic-table.md`
- Examples: `components/table/DataTable.tsx`, `components/on-page-analysis/OnPageDataTable.tsx`

**useGenericUrlSync**: Shareable dashboard state (date range, dimensions, sort) → USE useGenericUrlSync
- Template: `docs/components/url-sync.md`
- URL Format: `?start=DATE&end=DATE&dimensions=a,b&sortBy=col&expanded=keys`

**Store Pattern**: New dashboard/report similar to existing → COPY reportStore pattern
- Template: `docs/components/store-pattern.md`
- Examples: `stores/reportStore.ts`, `stores/onPageStore.ts`

## Building Features — Decision Tree

**Step 1: Search for similar**
```bash
grep -r "GenericDataTable" components/
find . -name "*Report*" -o -name "*Analysis*"
```

**Step 2: Calculate similarity (0-100%)**
- Same data structure (hierarchical) = 20%
- Same interactions (expand/sort/filter) = 20%
- Same columns (attributes + metrics) = 20%
- Same state (URL sync, persistence) = 20%
- Same loading (parent + lazy children) = 20%

**Step 3: Choose workflow**
- 80-100%: Use GenericDataTable → `docs/workflows/new-dashboard.md`
- 60-80%: Extend generic with customization
- 0-40%: Build custom → `docs/workflows/standalone-component.md`

## Common Operations

| Task | Files | Workflow |
|------|-------|----------|
| **New dashboard** | 7-8 files | `docs/workflows/new-dashboard.md` |
| **Add metric** | 3-4 files | `docs/workflows/add-metric.md` |
| **Add dimension** | 3 files | `docs/workflows/add-dimension.md` |
| **Custom component** | 2-3 files | `docs/workflows/standalone-component.md` |

## Working Principles

1. **Review before building** — Check existing patterns first
2. **DRY** — Reuse GenericDataTable, useGenericUrlSync
3. **Data-forward** — Clarity, scannability, density
4. **Hierarchical core** — Expansion/collapse critical
5. **Follow patterns** — Don't introduce new ways
6. **Use tokens** — Never hardcode values
7. **Test with real data** — Large numbers, long text
8. **Accessibility** — Keyboard nav, focus states

## Known Issues

- No tests
- Large bundle (Ant + shadcn)
- No dark mode
- No table virtualization
