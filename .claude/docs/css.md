# CSS & Styling Patterns Reference

## Styling Strategy

| Tool | Use Case |
|------|----------|
| **Ant Theme** (`styles/theme.ts`) | Customize Ant components globally |
| **CSS Modules** (`*.module.css`) | Component-specific styles |
| **Tailwind** | Layout, spacing utilities |
| **CSS Variables** (`var(--token)`) | Access design tokens in CSS |

Decision: Ant component globally? → `styles/theme.ts`. Component-specific? → CSS Modules. Quick layout? → Tailwind. Need token? → CSS variable.

---

## Design Tokens

**Source of truth**: `styles/tokens.css` (CSS vars) + `styles/tokens.ts` (TypeScript constants)
**Rule**: NEVER hardcode values. Always use tokens.

Read source files directly for complete token reference. Key conventions:
- Prefixes: `--color-*`, `--spacing-*`, `--radius-*`, `--shadow-*`, `--font-*`
- Naming: semantic names (`--color-bg-primary`), NOT values (`--color-ffffff`)
- Scales: `-xs`/`-sm`/`-md`/`-lg`/`-xl` OR numeric, shade numbers for colors (`-50` to `-900`)

**Adding new tokens**: Check reuse first → follow prefix pattern → add to both `tokens.css` and `tokens.ts`.

---

## CSS Modules

- **Class naming**: camelCase (`.container`, `.headerTitle`)
- **File naming**: PascalCase.module.css (`DataTable.module.css`)

---

## Ant Design Theme

**File**: `styles/theme.ts` — read source directly for current config. Applied via `<ConfigProvider theme={theme}>` in `app/layout.tsx`.

---

## Ant Overrides

**Pattern**: CSS Modules + `:global()` to override Ant Design styles:

```css
.dataTable :global(.ant-table-thead > tr > th) {
  background: var(--color-gray-50) !important;
}
```

**Specificity escalation**: Try without `!important` first → increase selector specificity → `!important` as last resort. Check DevTools to see what's winning. Use `!important` only when Ant uses inline styles or its own `!important`.

---

## Typography

**CRITICAL**: Use `font-feature-settings: 'tnum'` (tabular-nums) for table numbers, NOT monospace font.
- tabular-nums: same-width digits, preserves design font, looks professional
- monospace: looks "code-like", wrong for data tables
- Font stacks: `--font-family-base` (body), `--font-family-data` (tables), `--font-family-mono` (code only)

---

## Ant Design Table: Sticky Headers & Scroll Sync

### Overview

Ant Design's `<Table>` supports sticky headers via the `sticky` prop. When enabled, the table splits into two separate DOM elements for proper sticky behavior.

### How It Works

**Without sticky** (single table):
```
.ant-table-content (overflow-x: auto)
  └── <table>
        ├── <thead>
        └── <tbody>
```

**With sticky** (split tables):
```
.ant-table-header (overflow: hidden, position: sticky)
  └── <table> (header only)
.ant-table-body (overflow-x: auto)
  └── <table> (body only)
```

### Required Configuration

```tsx
// GenericDataTable.tsx
<Table
  scroll={{ x: tableWidth }}      // REQUIRED: explicit width in pixels
  sticky={{ offsetHeader: 0 }}    // Enable sticky header
  // ...
/>
```

### Critical CSS Rules

```css
/* styles/tables/base.module.css */

/* 1. Allow sticky to escape wrapper */
.dataTable :global(.ant-table-wrapper) {
  overflow: visible !important;
}

/* 2. Fixed layout, but DO NOT override width */
.dataTable :global(.ant-table-header table),
.dataTable :global(.ant-table-body table) {
  table-layout: fixed !important;
  /* ⚠️ NEVER add: width: max-content !important; — breaks scroll sync */
}

/* 3. Body handles horizontal scroll */
.dataTable :global(.ant-table-body) {
  overflow-x: auto !important;
}

/* 4. Sticky holder styling */
.dataTable :global(.ant-table-sticky-holder) {
  z-index: 100 !important;
  background: var(--color-background-primary) !important;
}
```

### Why Width Override Breaks Scroll Sync

**Root cause**: When you set `width: max-content !important` on header and body tables:

1. Header table width = sum of **measured column widths** (from ResizeObserver)
2. Body table width = sum of **configured column widths** (from column definitions)
3. These can differ by a few pixels due to rendering variations
4. Different widths = different `scrollWidth` = different `maxScrollLeft`
5. Scrolling body to max doesn't align with header's max → **desync**

**Solution**: Let Ant Design control table width via `scroll.x` prop. Both tables get the **same width** → identical scroll behavior.

### Scroll Sync Mechanism

Ant Design syncs header/body scroll positions via JavaScript:

```
User scrolls .ant-table-body
  ↓
onScroll event fires
  ↓
onInternalScroll() handler in Table.js
  ↓
forceScroll(scrollLeft, scrollHeaderRef.current)
  ↓
Header's scrollLeft = Body's scrollLeft
```

The header has `overflow: hidden` (set inline by FixedHolder), so it doesn't scroll natively. Its `scrollLeft` is controlled programmatically.

### useDragScroll Hook Integration

The `useDragScroll` hook adds redundant scroll sync for safety:

```typescript
// hooks/useDragScroll.ts
if (header && body) {
  syncScroll = () => { header.scrollLeft = body.scrollLeft; };
  body.addEventListener('scroll', syncScroll);
}
```

This is safe because it syncs in the same direction as Ant Design's built-in sync.

### Common Pitfalls

| Mistake | Result | Fix |
|---------|--------|-----|
| `width: max-content` on tables | Header/body scroll desync | Remove, let Ant Design control via `scroll.x` |
| `overflow: auto` on `.ant-table-header` | Two independent scrollbars | Let Ant Design's `overflow: hidden` remain |
| `overflow: hidden` on `.ant-table-wrapper` | Sticky trapped, won't stick | Add `overflow: visible !important` |
| Missing `scroll.x` value | No horizontal scroll | Always calculate: `attributeWidth + visibleMetricsWidth` |

### Debugging Scroll Desync

1. Open DevTools → Elements panel
2. Find `.ant-table-header table` and `.ant-table-body table`
3. Compare their `width` values in Computed styles
4. If different, CSS is overriding Ant Design's width
5. Check for `width: max-content` or similar overrides

### Files Reference

| File | Purpose |
|------|---------|
| `styles/tables/base.module.css` | Sticky and scroll CSS rules |
| `hooks/useDragScroll.ts` | Drag-to-scroll + backup sync |
| `components/table/GenericDataTable.tsx` | `sticky` prop configuration |

---

## Shared Component Styles

Reusable CSS modules in `styles/components/` provide base styling for Ant Design components. Component-specific modules can compose with these for consistent look while adding unique overrides.

### Modal Base (`styles/components/modal.module.css`)

**What it provides**: Consistent shell styling for all Ant Design Modals — refined close button, tighter header, compact footer, border radius, shadow, and form label styling.

**Standard usage** (most modals):
```typescript
import modalStyles from '@/styles/components/modal.module.css';

<Modal className={modalStyles.modal} ...>
```

**Composition usage** (modals with additional overrides):
```typescript
import modalStyles from '@/styles/components/modal.module.css';
import styles from './MyCustomModal.module.css';

<Modal className={`${modalStyles.modal} ${styles.modal}`} ...>
```

The component-specific `.modal` class can override any shared rule (e.g., hide header, change body padding, add flex layout).

**Applied to**: All modals in the project (21 total). Every `<Modal>` must include `className={modalStyles.modal}`. New modals should always import and apply this class.

---

## Known Gotchas

### Ant Design v6 Migration

Project uses Ant Design **v6.2.0** — NOT v5.

- `.ant-select-selector` class **NO LONGER EXISTS** — border is now on `.ant-select` directly
- Target `.ant-select` for border overrides, not `.ant-select-selector`
- CSS-in-JS overrides: use global CSS with `!important` or `ConfigProvider` theme tokens
- Old globals.css rules targeting `.ant-select-selector` are dead code

### EditableSelect Component

- Display mode and edit mode must have matching height to avoid pixel jumps
- Use explicit `height: 30px` on both states + `border: 1px solid transparent` on display mode
- Use `popupMatchSelectWidth={false}` so dropdown popup sizes to content, not trigger width
- Ant Design Select needs `height`, `min-height` overrides on the root `.ant-select` element to respect custom sizing

### Table Layout for Inline-Editable Cells

- Use `tableLayout="fixed"` on Ant Design Tables with inline-editable cells to prevent column width jumps
- Fixed layout respects declared column `width` values; columns without width take remaining space

---

## Performance Tips

1. **Use CSS variables**: Faster than JS-based theming
2. **Minimize CSS Modules**: Scope only what needs to be scoped
3. **Prefer Tailwind for utilities**: Already optimized and purged
4. **Avoid deep nesting**: Max 3 levels in CSS
5. **Use will-change sparingly**: Only for animations
6. **Leverage browser defaults**: Don't reset everything

---

## Checklist

Before writing custom CSS:
- [ ] Can I use Tailwind utilities? (layout, spacing)
- [ ] Can I customize via Ant theme? (global component styles)
- [ ] Do I need component-specific styles? (use CSS Modules)
- [ ] Am I using design tokens? (no hardcoded values)
- [ ] For table numbers, did I use `tabular-nums`? (not monospace)
- [ ] Do I need Ant overrides? (use :global() + !important)
