# Design Patterns Reference

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
- Syncs active → loaded filters (see `docs/state.md` > Dual-State Pattern)
- Updates URL, collapses expanded rows

---

## Component Library Split

**Quick rule**: Ant Design for data components (tables, forms, pickers), shadcn/ui for layout (sidebar, card, dialog), custom CSS Modules for unique UI. Full table in `docs/project-overview.md`.

---

## Modal Pattern

Always apply shared base styles: `className={modalStyles.modal}` from `@/styles/components/modal.module.css`. See `docs/css.md` > Shared Component Styles.

---

## Visual Specifications

Full design tokens in `styles/tokens.css` + `styles/tokens.ts`. See `docs/css.md` for complete reference.

Quick reference: `#00B96B` accent, `#e8eaed` borders, `#f0f9ff` hover, `#e6f7ed` expanded rows, 14px body, `tabular-nums` for table numbers.
