# Front-End Reference

## Design Direction

**Data-Forward Professional Tool** — Clarity over decoration. Inspired by Linear, Stripe, Vercel.

- Information density: 4px base spacing
- Subtle depth: Borders + soft shadows, no heavy decoration
- Monochrome + `#00B96B` accent (teal/green)
- Hierarchical tables: 20px indent per nesting level

**Tokens**: `styles/tokens.css` (CSS vars) + `styles/tokens.ts` (TypeScript constants) — NEVER hardcode values.

---

## Styling Strategy

| Need | Tool | Example |
|------|------|---------|
| Customize Ant components globally | `styles/theme.ts` via ConfigProvider | Table header bg, button height |
| Component-specific styles | CSS Modules (`*.module.css`) | `.dataTable :global(.ant-table-thead)` |
| Layout, spacing utilities | Tailwind | `flex gap-2 p-4` |
| Access tokens in CSS | CSS Variables | `var(--color-primary-500)` |

**Ant overrides**: CSS Modules + `:global(.ant-class)` pattern. Try without `!important` → increase specificity → `!important` as last resort.

**CSS Module naming**: camelCase classes (`.headerTitle`), PascalCase filenames (`DataTable.module.css`).

---

## Component Library

| Use Case | Library | Examples |
|----------|---------|----------|
| Data-heavy | Ant Design | Table, Form, DatePicker, Modal, Select |
| Layout | shadcn/ui | Sidebar, Card, Dialog, Tabs |
| Custom UI | CSS Modules + Tailwind | Unique components |

---

## Generic Components — Read BEFORE Building

**GenericDataTable**: Hierarchical data + expand/collapse + grouped metrics
- Source: `components/table/GenericDataTable.tsx`
- Examples: `components/table/DataTable.tsx`, `components/on-page-analysis/OnPageDataTable.tsx`

**useGenericUrlSync**: Shareable dashboard state (date range, dimensions, sort, expanded)
- Source: `hooks/useGenericUrlSync.ts`

**createTableStore**: New report/dashboard → factory store (20 lines of config)
- Source: `stores/createTableStore.ts`
- Examples: `stores/reportStore.ts`, `stores/onPageStore.ts`, `stores/dashboardStore.ts`

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
- Row 1: Column groups (from `COLUMN_GROUPS` config)
- Row 2: Individual metrics (from `METRIC_COLUMNS` config)

### Row States

| State | Background | Cursor |
|-------|------------|--------|
| Default | `#ffffff` | default |
| Hover | `#f0f9ff` | pointer |
| Expanded | group-specific color | default |

### Key Specs
- Attributes column: 300px fixed left, 20px indent per level
- Metric columns: right-aligned, `tabular-nums`, 14px
- Sort: click header toggles ascending/descending
- Themes: 4 variants in `styles/tables/themes/*.module.css` (marketing, onPage, session, dashboard)

---

## Typography

**CRITICAL**: Use `font-feature-settings: 'tnum'` (tabular-nums) for table numbers — NOT monospace font.
- `--font-family-base` — body text (Inter)
- `--font-family-data` — table numbers (Inter with tabular-nums)
- `--font-family-mono` — code only (JetBrains Mono)

---

## Token Conventions

- Prefixes: `--color-*`, `--spacing-*`, `--radius-*`, `--shadow-*`, `--font-*`, `--transition-*`
- Naming: semantic (`--color-bg-primary`), NOT values (`--color-ffffff`)
- Scales: `-xs`/`-sm`/`-md`/`-lg`/`-xl` or shade numbers (`-50` to `-900`)
- Adding tokens: check reuse first → follow prefix pattern → add to BOTH `tokens.css` AND `tokens.ts`

---

## Gotchas

- **Ant Design v6.2**: `.ant-select-selector` class no longer exists — target `.ant-select` directly
- **Scroll width**: NEVER `scroll={{ x: 'max-content' }}` — ALWAYS calculate: `attributeWidth + visibleMetricsWidth`
- **Sticky headers**: `.ant-table-wrapper` needs `overflow: visible !important`. NEVER `width: max-content` on header/body tables (breaks scroll sync). Deep-dive: read `styles/tables/base.module.css`
- **Modal base**: Every `<Modal>` must include `className={modalStyles.modal}` from `styles/components/modal.module.css`
- **Editable cells**: Use `tableLayout="fixed"` to prevent column width jumps
- **EditableSelect**: Display/edit modes must have matching `height: 30px` + `border: 1px solid transparent` on display
- **Design tokens**: NEVER hardcode colors/spacing — use `var(--token)` or import from `tokens.ts`
- **Ant overrides**: `:global(.ant-class)` in CSS Modules. Try without `!important` first

---

## Source Files

| Topic | File |
|-------|------|
| Design tokens (CSS) | `styles/tokens.css` |
| Design tokens (TS) | `styles/tokens.ts` |
| Ant theme config | `styles/theme.ts` |
| Table base styles | `styles/tables/base.module.css` |
| Table themes | `styles/tables/themes/*.module.css` |
| Modal base styles | `styles/components/modal.module.css` |
| Dropdown styles | `styles/components/dropdown.module.css` |
| Global styles | `app/globals.css` |
