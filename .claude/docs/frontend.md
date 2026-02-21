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

## Panel & Accordion Patterns

### Background Layering (contrast hierarchy)

Content inside flyout panels sits on a **3-layer background stack**. Every layer must contrast against the one below it:

```
Panel shell    → --color-background-canvas (#eef0f2)
  White card   → --color-background-primary (#ffffff)  ← whiteBox / contentCard
    Row hover  → --color-background-secondary (#fafbfc) or --color-background-hover (#f0f9ff)
```

**Rule**: Never place rows, borders, or hover states directly on canvas. Always wrap section content in a white card container (`whiteBox` pattern: white bg + `--color-border-light` border + `--radius-lg` + `--shadow-xs`). This ensures `--color-gray-100` borders and `--color-gray-50` hover states are visible against white, not invisible against canvas gray.

### Tab Bars (inside panels)

- **Underline style**: `border-bottom: 2px solid transparent`, active = `--color-gray-900`
- **Background**: `--color-background-primary` (white) — connects visually to the header above
- **Horizontal padding**: Match the header padding (typically `0 24px`)
- **Typography**: 13px, `font-weight: 500` default / `600` active
- **Badge**: pill with `--color-gray-100` bg, `--radius-full`, 11px text

### Accordion Sections

- **Section dividers**: `1px solid --color-border-light` between sections, none on last child
- **Header**: `padding: 12px 16px`, `font-size: 13px`, `font-weight: 600`, `color: --color-gray-700`
- **Header hover**: `background: --color-gray-50`
- **Header layout**: chevron (12px) → gap (8px) → icon → gap (8px) → label (flex: 1) → status indicator
- **Content padding**: `8px 16px 16px 36px` — top gap separates from header; left aligns with header icon (16px base + 12px chevron + 8px gap = 36px)
- **Lazy mount**: Only render content when expanded (avoids mounting multiple editors)

### Inline Data Grids

For structured data grids (e.g., CPA targets geo × channel):

- **Container**: `--color-border-medium` border, `--radius-lg`, `overflow: hidden`
- **Header row**: `--color-background-tertiary` bg, `--color-border-medium` bottom border, 11px uppercase text with `letter-spacing: 0.04em`
- **Data rows**: `--color-border-light` between rows, none on last child
- **Alternating rows**: even rows get `--color-background-secondary` for subtle striping
- **Row hover**: `--color-background-hover` (#f0f9ff, light blue)
- **Input text**: 13px, `font-weight: 500`, `--color-gray-800`

### Save Status Indicators

Shown as pill badges on accordion headers (right-aligned):

| State | Text Color | Background |
|-------|-----------|------------|
| Saving | `--color-gray-500` | `--color-gray-100` |
| Saved | `--color-status-green` | `--color-status-green-bg` |
| Error | `--color-status-red` | `--color-status-red-bg` |

- Style: `--radius-full` pill, 11px font, `font-weight: 500`
- Auto-save debounce: **800ms** for numeric/short inputs, **1500ms** for rich text
- **Flush on unmount**: When a section unmounts (accordion closes), fire pending save immediately — never discard unsaved changes

### CRUD Lists (e.g., Angles tab)

- **Row**: `padding: 9px 16px`, `--color-border-light` bottom border
- **Row hover**: `--color-background-secondary`, action buttons fade in (`opacity: 0` → `1`)
- **Delete confirm row**: `--color-status-red-bg` background, red text button (not filled), cancel icon button
- **Inline edit row**: `--color-gray-50` background, input + save/cancel buttons always visible
- **Add row**: sticky bottom, `--color-gray-50` bg, `--color-gray-200` top border
- **Empty state**: centered text, 13px, `--color-gray-400`

### Status Color Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--color-status-red` | `#dc2626` | Destructive actions, error text |
| `--color-status-red-bg` | `#fef2f2` | Error row backgrounds |
| `--color-status-red-hover` | `#fee2e2` | Destructive button hover |
| `--color-status-red-dark` | `#b91c1c` | Confirm dialog text |
| `--color-status-green` | `#059669` | Success indicators |
| `--color-status-green-bg` | `#ecfdf5` | Success pill backgrounds |

### Reference Files

| Pattern | File |
|---------|------|
| Panel base styles | `components/marketing-pipeline/PipelinePanel.module.css` |
| Panel tabs + accordions | `components/marketing-pipeline/ConceptDetailPanel.module.css` |
| CPA grid | `components/marketing-pipeline/CpaTargetsModal.module.css` |
| CRUD list (angles) | `components/marketing-pipeline/ProductAnglesTab.module.css` |
| Product detail panel | `components/marketing-pipeline/ProductDetailPanel.tsx` |

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
