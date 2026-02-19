# Design Patterns Reference

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

---

## Component Library Split

| Use Case | Library | Examples |
|----------|---------|----------|
| Data-heavy | Ant Design | Table, Form, DatePicker, Modal |
| Layout | shadcn/ui | Sidebar, Card, Dialog, Tabs |
| Custom | CSS Module + Tailwind | Unique UI |

---

## Generic Components (Review BEFORE Building)

**GenericDataTable**: Hierarchical data + expand/collapse + multiple metrics → USE GenericDataTable
- Source: `components/table/GenericDataTable.tsx`
- Examples: `components/table/DataTable.tsx`, `components/on-page-analysis/OnPageDataTable.tsx`

**useGenericUrlSync**: Shareable dashboard state (date range, dimensions, sort) → USE useGenericUrlSync
- Source: `hooks/useGenericUrlSync.ts`
- URL Format: `?start=DATE&end=DATE&dimensions=a,b&sortBy=col&expanded=keys`

**Store Pattern**: New dashboard/report → USE `createTableStore` factory (20 lines of config)
- Source: `stores/createTableStore.ts`
- Examples: `stores/reportStore.ts`, `stores/onPageStore.ts`, `stores/dashboardStore.ts`

---

## GenericDataTable

**File**: `components/table/GenericDataTable.tsx` (read source directly for props API and type definitions)

#### Scroll Configuration (CRITICAL)

**NEVER** use `scroll={{ x: 'max-content' }}` with grouped columns. Always calculate exact width:
```typescript
const tableWidth = attributeWidth + metricColumns
  .filter(col => visibleColumns.includes(col.id))
  .reduce((sum, col) => sum + col.width, 0);
```
This is an Ant Design bug with grouped columns — always calculate exact width.

---

## Table Patterns

### Two-Row Header
```
┌────────────┬──────────────────────────────┬─────────────────────┐
│ Attributes │    Group 1 Header            │  Group 2 Header     │
├────────────┼──────────┬──────────┬────────┼──────────┬──────────┤
│            │ Metric A │ Metric B │ Metric C│ Metric D │ Metric E │
└────────────┴──────────┴──────────┴────────┴──────────┴──────────┘
```
- Row 1: Column groups (optional) from `COLUMN_GROUPS` config
- Row 2: Individual metric labels (always) from `METRIC_COLUMNS` config

### Row States

| State | Background | Cursor |
|-------|------------|--------|
| Default | `#ffffff` | default |
| Hover | `#f0f9ff` | pointer |
| Expanded | `var(--group-color-N)` | default |

### Key Specs
- Attributes column: 300px fixed left, 20px indent/level
- Metric columns: right-aligned, `tabular-nums` (NOT monospace), 14px
- Sort: click header toggles ▲/▼

---

## "Load Data" Button

- **CRITICAL**: Only this button triggers data fetch (not dimension/date changes)
- Enabled only when `hasUnsavedChanges === true`
- Syncs active → loaded filters
- Updates URL, collapses expanded rows

---

## Modal Pattern

Always apply shared base styles: `className={modalStyles.modal}` from `@/styles/components/modal.module.css`. See `docs/css.md` > Shared Component Styles.

---

## Visual Specifications

Full design tokens in `styles/tokens.css` + `styles/tokens.ts`. See `docs/css.md` for complete reference.

Quick reference: `#00B96B` accent, `#e8eaed` borders, `#f0f9ff` hover, `#e6f7ed` expanded rows, 14px body, `tabular-nums` for table numbers.
