# CSS & Styling Patterns Reference

Dense reference for styling approach, design tokens, and CSS patterns.

## Table of Contents

1. [Styling Strategy](#styling-strategy) - When to use what
2. [Design Tokens](#design-tokens) - Complete token reference
3. [CSS Modules](#css-modules) - Component-specific styles
4. [Ant Design Theme](#ant-design-theme) - Global customization
5. [Ant Overrides](#ant-overrides) - When theme isn't enough
6. [Typography](#typography) - Font patterns, tabular-nums
7. [Responsive Design](#responsive-design) - Breakpoints, mobile

---

## Styling Strategy

**Hybrid approach** - Use the right tool for the job:

| Tool | Use Case | Example |
|------|----------|---------|
| **Ant Theme** (`styles/theme.ts`) | Customize Ant components globally | Primary color, border radius, font family |
| **CSS Modules** (`*.module.css`) | Component-specific styles | Custom layouts, unique UI patterns |
| **Tailwind** | Layout, spacing utilities | `flex gap-4`, `p-6`, `rounded-lg` |
| **CSS Variables** (`var(--token)`) | Access design tokens in CSS | `background: var(--color-primary)` |

### Decision Tree

```
What are you styling?
  ↓
Ant Design component (globally)? → Use styles/theme.ts
  ↓
Component-specific custom styles? → Use CSS Modules
  ↓
Quick layout/spacing? → Use Tailwind utilities
  ↓
Need design token in CSS? → Use CSS variable (var(--token))
```

---

## Design Tokens

**File**: `styles/tokens.css`
**Rule**: NEVER hardcode values. Always use tokens.

### Colors

#### Primary (Brand Green: #00B96B)

```css
--color-primary-50: #e6f9f4;    /* Lightest tint */
--color-primary-100: #b3ede1;
--color-primary-200: #80e0cd;
--color-primary-300: #4dd4ba;
--color-primary-400: #1ac8a6;
--color-primary-500: #00B96B;   /* Base brand color */
--color-primary-600: #00a661;
--color-primary-700: #009254;
--color-primary-800: #007e47;
--color-primary-900: #00562f;   /* Darkest shade */
```

**Usage**:
- Primary buttons: `--color-primary-500`
- Hover states: `--color-primary-600`
- Dimension pills: `--color-primary-500`

---

#### Gray Scale (Neutral)

```css
--color-gray-50: #fafbfc;   /* Subtle backgrounds */
--color-gray-100: #f5f6f7;  /* Secondary backgrounds */
--color-gray-200: #e8eaed;  /* Borders */
--color-gray-300: #d1d5db;  /* Dividers */
--color-gray-400: #9ca3af;  /* Placeholder text */
--color-gray-500: #6b7280;  /* Secondary text */
--color-gray-600: #4b5563;  /* Body text (less common) */
--color-gray-700: #374151;  /* Headings (less common) */
--color-gray-800: #1f2937;  /* Dark headings */
--color-gray-900: #111827;  /* Primary text */
```

**Usage**:
- Body text: `--color-gray-900`
- Secondary text: `--color-gray-500`
- Borders: `--color-gray-200`
- Backgrounds: `--color-gray-50` or `--color-gray-100`

---

#### Semantic Colors

```css
--color-success: #10b981;  /* Green - success states */
--color-warning: #f59e0b;  /* Orange - warnings */
--color-error: #ef4444;    /* Red - errors */
--color-info: #3b82f6;     /* Blue - informational */
```

---

#### Background Colors

```css
--color-background-primary: #ffffff;      /* Main background */
--color-background-secondary: #fafbfc;    /* Subtle backgrounds */
--color-background-tertiary: #f5f6f7;     /* Cards, panels */
--color-background-hover: #f0f9ff;        /* Row hover (blue tint) */
--color-background-active: #e0f2fe;       /* Active state (blue) */
--color-background-expanded: #e6f7ed;     /* Expanded row (green tint) */
```

**Usage**:
- Page background: `--color-background-primary`
- Table row hover: `--color-background-hover`
- Expanded table row: `--color-background-expanded`

---

#### Legacy Aliases (Use specific tokens above instead)

```css
--color-primary: #00B96B;             /* → Use --color-primary-500 */
--color-text-primary: #111827;        /* → Use --color-gray-900 */
--color-text-secondary: #6b7280;      /* → Use --color-gray-500 */
--color-text-heading: #1f2937;        /* → Use --color-gray-800 */
--color-border-light: #e8eaed;        /* → Use --color-gray-200 */
--color-border-medium: #d1d5db;       /* → Use --color-gray-300 */
--color-border-dark: #9ca3af;         /* → Use --color-gray-400 */
```

---

### Spacing

```css
/* Numeric scale */
--spacing-0: 0px;
--spacing-1: 4px;     /* Tight spacing, icon margins */
--spacing-2: 8px;     /* Compact padding */
--spacing-3: 12px;    /* Default gaps */
--spacing-4: 16px;    /* Comfortable padding */
--spacing-5: 20px;    /* Indent per depth level */
--spacing-6: 24px;    /* Section spacing */
--spacing-7: 28px;
--spacing-8: 32px;    /* Large spacing */
--spacing-10: 40px;
--spacing-12: 48px;
--spacing-16: 64px;

/* Named scale (aliases) */
--spacing-xs: 4px;    /* → --spacing-1 */
--spacing-sm: 8px;    /* → --spacing-2 */
--spacing-md: 16px;   /* → --spacing-4 */
--spacing-lg: 24px;   /* → --spacing-6 */
--spacing-xl: 32px;   /* → --spacing-8 */
```

**Common usages**:
- Icon margins: `--spacing-1` (4px)
- Filter gaps: `--spacing-3` (12px)
- Card padding: `--spacing-4` (16px) or `--spacing-6` (24px)
- Hierarchy indent: `--spacing-5` (20px) per level
- Page padding: `--spacing-6` (24px)

---

### Border Radius

```css
--radius-none: 0px;
--radius-sm: 4px;      /* Buttons, inputs */
--radius-md: 6px;      /* Default for most components */
--radius-lg: 8px;      /* Cards, modals */
--radius-xl: 12px;     /* Large containers */
--radius-2xl: 16px;    /* Extra large */
--radius-full: 9999px; /* Pills, badges, circular */
```

**Usage**:
- Buttons: `--radius-sm`
- Cards: `--radius-lg`
- Dimension pills: `--radius-full`

---

### Font Sizes

```css
--font-size-xs: 12px;  /* Captions, labels */
--font-size-sm: 13px;  /* Small text */
--font-size-md: 14px;  /* Body text, table cells */
--font-size-lg: 16px;  /* Headings, emphasized text */
```

---

### Font Weights

```css
--font-weight-normal: 400;    /* Body text */
--font-weight-medium: 500;    /* Emphasized text */
--font-weight-semibold: 600;  /* Headings, buttons */
--font-weight-bold: 700;      /* Strong emphasis */
```

---

### Font Families

```css
--font-family-data: 'Inter', 'SF Pro Display', -apple-system, sans-serif;
--font-family-mono: 'JetBrains Mono', 'SF Mono', Monaco, monospace;
--font-family-base: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

**Usage**:
- Body text: `--font-family-base`
- Tables, data: `--font-family-data` (with `font-feature-settings: 'tnum'`)
- Code blocks: `--font-family-mono`

---

### Shadows

```css
--shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
--shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.03);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02);
--shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
--shadow-float: 0 8px 16px rgba(0, 0, 0, 0.08);
--shadow-modal: 0 24px 48px rgba(0, 0, 0, 0.12);
--shadow-button: 0 1px 2px rgba(0, 185, 107, 0.2);
--shadow-button-hover: 0 2px 4px rgba(0, 185, 107, 0.3);
--shadow-fixed: inset 10px 0 8px -8px rgba(0, 0, 0, 0.15);
```

**Usage**:
- Cards: `--shadow-md`
- Dropdowns: `--shadow-lg`
- Modals: `--shadow-modal`
- Buttons: `--shadow-button` (hover: `--shadow-button-hover`)

---

### Transitions

```css
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-elastic: 400ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

---

## CSS Modules

**When to use**: Component-specific styles that aren't covered by Ant or Tailwind

### Template

```typescript
// MyComponent.tsx
import styles from './MyComponent.module.css';

export function MyComponent() {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Title</h2>
      <p className={styles.text}>Content</p>
    </div>
  );
}
```

```css
/* MyComponent.module.css */
.container {
  background: var(--color-background-primary);
  padding: var(--spacing-4);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-gray-900);
  margin-bottom: var(--spacing-3);
}

.text {
  font-size: var(--font-size-md);
  color: var(--color-gray-500);
  line-height: 1.5;
}
```

### Naming Convention

**Design Token Naming:**

**Prefix Rules:**
- `--color-*` for all colors
- `--spacing-*` for all spacing values
- `--radius-*` for border radius
- `--shadow-*` for box shadows
- `--font-*` for font families
- `--text-*` or `--font-size-*` for font sizes

**Value Naming:**
- Use semantic names, not values: `--color-bg-primary` not `--color-ffffff`
- Use size scales: `-xs`, `-sm`, `-md`, `-lg`, `-xl` OR numeric `-1`, `-2`, `-3`
- Use state suffixes: `-hover`, `-active`, `-disabled`
- Use shade numbers for color scales: `-50`, `-100`, `-500`, `-900`

**Examples:**
```css
/* ✅ CORRECT */
--color-bg-primary: #ffffff;
--color-border-hover: #d1d5db;
--spacing-section: 24px;
--shadow-card-hover: 0 8px 16px rgba(0,0,0,0.1);
--color-primary-500: #00B96B;

/* ❌ WRONG */
--white: #ffffff;              /* Not semantic */
--border-hover-color: #d1d5db; /* Wrong prefix */
--space-24: 24px;              /* Value in name */
--primary: #00B96B;            /* Missing shade number */
```

**Adding new tokens:**
1. Check if existing token can be reused
2. Follow prefix + semantic name pattern
3. Add to `styles/tokens.css` (CSS vars)
4. Add to `styles/tokens.ts` (TypeScript constants)
5. Document in css.md

---

**CSS Classes & Files:**

- **Classes**: camelCase (e.g., `.container`, `.headerTitle`, `.actionButton`)
- **Files**: PascalCase.module.css (e.g., `DataTable.module.css`)

---

## Ant Design Theme

**File**: `styles/theme.ts`
**Purpose**: Customize Ant Design components globally

### Current Configuration

```typescript
import type { ThemeConfig } from 'antd';

export const theme: ThemeConfig = {
  token: {
    // Colors
    colorPrimary: '#00B96B',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    colorBgContainer: '#ffffff',
    colorBorder: '#e8eaed',

    // Typography
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',

    // Spacing
    padding: 16,
    margin: 16,

    // Border radius
    borderRadius: 6,

    // Shadows (subtle)
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
  },
  components: {
    Table: {
      headerBg: '#fafbfc',
      headerColor: '#6b7280',
      rowHoverBg: '#f0f9ff',
      borderColor: '#e8eaed',
    },
    Button: {
      primaryShadow: '0 1px 2px rgba(0, 185, 107, 0.2)',
    },
  },
};
```

### Usage

```typescript
// app/layout.tsx
import { ConfigProvider } from 'antd';
import { theme } from '@/styles/theme';

export default function RootLayout({ children }) {
  return (
    <ConfigProvider theme={theme}>
      {children}
    </ConfigProvider>
  );
}
```

---

## Ant Overrides

**When to use**: When global theme isn't enough and you need component-specific customization

### Pattern: CSS Modules + :global()

```css
/* DataTable.module.css */

/* Override Ant Table styles */
.wrapper :global(.ant-table) {
  background: var(--color-background-primary) !important;
}

.wrapper :global(.ant-table-thead > tr > th) {
  background: var(--color-gray-50) !important;
  color: var(--color-gray-500) !important;
  font-weight: var(--font-weight-semibold) !important;
  border-bottom: 2px solid var(--color-gray-200) !important;
}

.wrapper :global(.ant-table-tbody > tr:hover > td) {
  background: var(--color-background-hover) !important;
}

/* Fixed column shadow */
.wrapper :global(.ant-table-cell-fix-left) {
  box-shadow: var(--shadow-fixed) !important;
}
```

**Usage**:
```typescript
import styles from './DataTable.module.css';

<div className={styles.wrapper}>
  <Table ... />
</div>
```

### Specificity Rules - When to Use !important

**Level 1 - Try without !important first:**
```css
/* Start here - often sufficient */
.wrapper :global(.ant-table) {
  background: var(--color-background-primary);
}
```

**Level 2 - Increase specificity if Level 1 doesn't work:**
```css
/* Add more selector specificity */
.wrapper :global(.ant-table.ant-table-wrapper) {
  background: var(--color-background-primary);
}

/* Or increase parent specificity */
.wrapper.wrapper :global(.ant-table) {
  background: var(--color-background-primary);
}
```

**Level 3 - Use !important only as last resort:**
```css
/* When Ant uses inline styles or !important */
.wrapper :global(.ant-table) {
  background: var(--color-background-primary) !important;
}
```

**When to use !important:**
- ✅ Ant component uses inline styles (rare but happens)
- ✅ Ant's CSS already uses !important (check browser inspector)
- ✅ Multiple Ant components conflict and specificity doesn't resolve it
- ✅ Component prop doesn't provide customization option

**When NOT to use !important:**
- ❌ As first attempt (try specificity first - Levels 1 & 2)
- ❌ Just to "make it work" (understand why override isn't working)
- ❌ In global styles (affects entire app, hard to override later)
- ❌ For styles Ant provides props for (use `className` or `style` props instead)

**Debugging workflow:**
1. Open browser DevTools inspector
2. Find the Ant element you want to style
3. Check "Computed" tab to see which styles are winning
4. Check if Ant is using inline styles (shows in "element.style")
5. Check if Ant's CSS uses !important
6. Try Level 1 (no !important) → Level 2 (more specificity) → Level 3 (!important)

**Why this matters:**
- Ant Design uses high specificity selectors and sometimes inline styles
- `!important` should be used strategically, not by default
- Excessive !important makes future maintenance harder
- Many Ant overrides work fine without !important

---

## Typography

### Table Numbers: tabular-nums

**CRITICAL**: Use `font-feature-settings: 'tnum'` for table numbers, NOT monospace font

```css
/* ✅ CORRECT - Tabular nums with data font */
.metricCell {
  font-family: var(--font-family-data);
  font-feature-settings: 'tnum'; /* Aligns digits vertically */
  text-align: right;
}

/* ❌ WRONG - Monospace changes character width */
.metricCell {
  font-family: var(--font-family-mono); /* Don't use for data */
}
```

**What is tabular-nums?**
- OpenType feature that makes all digits same width
- "123" and "999" take same horizontal space
- Aligns columns of numbers perfectly
- Looks professional, not "code-like"

**Example**:
```
Without tabular-nums:  With tabular-nums:
  1,234                  1,234
 12,345                 12,345
123,456                123,456
(misaligned)           (perfectly aligned)
```

**Difference - tabular-nums vs monospace vs default:**

```css
/* ✅ CORRECT - tabular-nums */
.metric-cell {
  font-variant-numeric: tabular-nums;
  /* OR: font-feature-settings: 'tnum'; */
  /* Numbers: 1,234.56 */
  /*          9,876.54 */
  /* Digits align vertically ↑ */
  /* Preserves design system font (Inter, SF Pro) */
}

/* ❌ WRONG - monospace */
.metric-cell {
  font-family: monospace;
  /* Numbers look like code, ugly in tables */
  /* Loses design system font */
  /* Entire character set is monospace, not just digits */
  /* Use only for actual code snippets */
}

/* ❌ WRONG - default (proportional) */
.metric-cell {
  /* No tabular-nums applied */
  /* Numbers: 1,234.56 */
  /*          9,876.54 */
  /* Misaligned because '1' is narrower than '9' */
  /* Different digit widths cause column misalignment */
}
```

**When to use each:**
- **tabular-nums**: Data tables, metrics, financial dashboards, any columnar numbers
- **monospace**: Code snippets, terminal output, technical documentation, log files
- **default (proportional)**: Body text, labels, headings, prose

**Why tabular-nums is better than monospace for tables:**
1. Maintains design system typography (Inter/SF Pro)
2. Only affects digits (0-9), not letters or symbols
3. Looks professional and polished, not "code-like"
4. Better readability for large datasets
5. Consistent with overall design language

---

### Font Stacks

```css
/* Body text - System fonts for performance */
body {
  font-family: var(--font-family-base);
  /* -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif */
}

/* Data-heavy components - Inter for readability */
.dataTable {
  font-family: var(--font-family-data);
  /* 'Inter', 'SF Pro Display', -apple-system, sans-serif */
}

/* Code blocks */
.codeBlock {
  font-family: var(--font-family-mono);
  /* 'JetBrains Mono', 'SF Mono', Monaco, monospace */
}
```

---

### Heading Styles

```css
h1 {
  font-size: 32px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-gray-900);
  line-height: 1.25;
}

h2 {
  font-size: 24px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-gray-900);
  line-height: 1.33;
}

h3 {
  font-size: 18px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-gray-800);
  line-height: 1.44;
}

/* Body text */
body {
  font-size: var(--font-size-md); /* 14px */
  font-weight: var(--font-weight-normal);
  color: var(--color-gray-900);
  line-height: 1.5;
}

/* Secondary text */
.secondary {
  color: var(--color-gray-500);
}
```

---

## Responsive Design

### Breakpoints (Tailwind)

```typescript
// tailwind.config.js
module.exports = {
  theme: {
    screens: {
      sm: '640px',   // Mobile landscape
      md: '768px',   // Tablet
      lg: '1024px',  // Desktop
      xl: '1280px',  // Large desktop
      '2xl': '1536px', // Extra large
    },
  },
};
```

### Usage

```typescript
// Tailwind classes
<div className="px-4 md:px-6 lg:px-8">
  <h1 className="text-xl md:text-2xl lg:text-3xl">Title</h1>
</div>

// CSS Modules with media queries
/* MyComponent.module.css */
.container {
  padding: var(--spacing-4);
}

@media (min-width: 768px) {
  .container {
    padding: var(--spacing-6);
  }
}

@media (min-width: 1024px) {
  .container {
    padding: var(--spacing-8);
  }
}
```

---

## Common Patterns

### Card Component

```css
.card {
  background: var(--color-background-primary);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-4);
  transition: box-shadow var(--transition-base);
}

.card:hover {
  box-shadow: var(--shadow-lg);
}

.cardHeader {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-3);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-gray-900);
}
```

---

### Button States

```css
.button {
  background: var(--color-primary-500);
  color: white;
  padding: var(--spacing-2) var(--spacing-4);
  border-radius: var(--radius-sm);
  font-weight: var(--font-weight-semibold);
  box-shadow: var(--shadow-button);
  transition: all var(--transition-base);
}

.button:hover {
  background: var(--color-primary-600);
  box-shadow: var(--shadow-button-hover);
}

.button:active {
  background: var(--color-primary-700);
}

.button:disabled {
  background: var(--color-gray-300);
  color: var(--color-gray-500);
  cursor: not-allowed;
  box-shadow: none;
}
```

---

### Focus States (Accessibility)

```css
/* All interactive elements should have visible focus */
button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}
```

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
