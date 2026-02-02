# Vitaliv Analytics Dashboard

Marketing analytics dashboard for visualizing performance metrics across dimensions (campaigns, ad groups, keywords, dates). Users drill down hierarchical data, apply filters, and analyze KPIs.

**Stack**: Next.js 16 + React 19 + TypeScript + Ant Design + Tailwind + Zustand + Neon DB

**Quick Commands**: See `.claude/rules/quick-reference.md` for cheat sheet

---

## Design Direction

**Data-Forward Professional Tool** — Clarity over decoration. Inspired by Linear, Stripe, Vercel.

- Information density: 4px base spacing
- Subtle depth: Borders and soft shadows
- Monochrome + #00B96B accent
- Hierarchical tables: 20px indent/level

**Tokens**: `styles/tokens.ts` + `styles/tokens.css`

---

## Architecture

```
app/          - Next.js routes, API endpoints
components/   - table/ (GenericDataTable), filters/, modals/, ui/
hooks/        - useGenericUrlSync, useUrlSync, useOnPageUrlSync
stores/       - reportStore, onPageStore, columnStore, onPageColumnStore
types/        - report.ts, table.ts, dimensions.ts, metrics.ts
lib/          - queryBuilder, treeUtils, formatters
.claude/
├── docs/     - Deep-dive reference docs
└── rules/    - Auto-loaded workflows, templates, cheat sheets
```

---

## Critical Warnings (Memorize)

⚠️ **Database Placeholders**
- PostgreSQL: `$1, $2, $3` ONLY
- MariaDB: `?, ?, ?` ONLY
- Never mix = SQL error

⚠️ **Table Scroll Width**
- NEVER: `scroll={{ x: 'max-content' }}`
- ALWAYS: `scroll={{ x: 350 + totalMetricWidth }}`
- Ant Design bug with grouped columns

⚠️ **Git Push Permission**
- NEVER auto-push without asking user
- Each session needs new permission

⚠️ **"Load Data" Button**
- ONLY button triggers data fetch
- Dimension/date changes update active state only

⚠️ **Import Paths**
- ALWAYS use `@/` absolute paths
- NEVER use relative paths (except same directory)

---

## Quick Reference Tables

### API Patterns

| Pattern | PostgreSQL | MariaDB |
|---------|-----------|---------|
| **Placeholders** | `$1, $2` | `?, ?` |
| **Response** | `{ success: true, data: [...] }` | Same |
| **Keys** | `parent::child::value` (use `::`) | Same |

[Full API docs](.claude/docs/api.md) | [MariaDB guide](.claude/docs/mariadb.md)

### State Patterns

| Pattern | Explanation |
|---------|-------------|
| **Dual-State** | Active (editing) vs Loaded (server truth) |
| **URL Sync** | Filters persist in URL |
| **Persistence** | Only `columnStore` persists (localStorage) |

[Full state docs](.claude/docs/state.md)

### Design Tokens

```css
--color-bg-primary: #ffffff;    --spacing-xs: 4px;
--color-border: #e8eaed;        --spacing-sm: 8px;
--color-accent: #00B96B;        --spacing-md: 12px;
--radius-sm: 4px;               --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
```

[Full design docs](.claude/docs/design.md) | [Full CSS docs](.claude/docs/css.md)

---

## Generic Components (Review BEFORE Building)

### GenericDataTable
**When**: Hierarchical data + expand/collapse + multiple metrics → USE GenericDataTable
**Template**: `.claude/rules/components/generic-table.md`
**Examples**: `components/table/DataTable.tsx`, `components/on-page-analysis/OnPageDataTable.tsx`

### useGenericUrlSync
**When**: Shareable dashboard state (date range, dimensions, sort) → USE useGenericUrlSync
**Template**: `.claude/rules/components/url-sync.md`
**URL Format**: `?start=DATE&end=DATE&dimensions=a,b&sortBy=col&expanded=keys`

### Store Pattern
**When**: New dashboard/report similar to existing → COPY reportStore pattern
**Template**: `.claude/rules/components/store-pattern.md`
**Examples**: `stores/reportStore.ts`, `stores/onPageStore.ts`

---

## Building Features - Decision Tree

**Step 1: Search for Similar**
```bash
grep -r "GenericDataTable" components/
find . -name "*Report*" -o -name "*Analysis*"
```

**Step 2: Calculate Similarity (0-100%)**
- Same data structure (hierarchical) = 20%
- Same interactions (expand/sort/filter) = 20%
- Same columns (attributes + metrics) = 20%
- Same state (URL sync, persistence) = 20%
- Same loading (parent + lazy children) = 20%

**Step 3: Choose Workflow**
- 80-100%: Use GenericDataTable → `.claude/rules/workflows/new-dashboard.md`
- 60-80%: Extend generic with customization
- 0-40%: Build custom → `.claude/rules/workflows/standalone-component.md`

**Checklists**: See `.claude/rules/workflows/new-feature-checklist.md` + `.claude/rules/quick-reference.md`

---

## Common Operations (Quick Reference)

| Task | Files | Workflow |
|------|-------|----------|
| **New dashboard** | 7-8 files | `.claude/rules/workflows/new-dashboard.md` |
| **Add metric** | 3-4 files | `.claude/rules/workflows/add-metric.md` |
| **Add dimension** | 3 files | `.claude/rules/workflows/add-dimension.md` |
| **Custom component** | 2-3 files | `.claude/rules/workflows/standalone-component.md` |

**Cheat Sheet**: `.claude/rules/quick-reference.md` (5-minute checklist)

---

## Development Rules

### Git Workflow
- **Commit**: Automatic when work complete (2+ criteria met)
- **Push**: ALWAYS ask user first (never auto-push)
- **PR**: Only when user requests

[Full git rules](.claude/rules/git-workflow.md)

### Build Rules
- **Run build**: Changed `.ts/.tsx/.js/.jsx/.css` files
- **Skip build**: Changed `.md` files or comments only

[Full build rules](.claude/rules/build-rules.md)

### File Edit Permissions
- Ask permission ONCE per file per editing session
- Session ends: when committing or switching tasks

---

## Code Conventions

- TypeScript strict mode, explicit return types
- React 19: Server Components default, `'use client'` when needed
- Naming: PascalCase (Components), useCamelCase (hooks), camelStore (stores)
- ALWAYS use `@/` imports (NEVER relative paths except same directory)
- NEVER hardcode colors/spacing (use design tokens)

---

## Documentation Structure

### Always-On (Auto-Loaded for All Work)
- `.claude/CLAUDE.md` - This file (core patterns, 293 lines)
- `.claude/rules/git-workflow.md` - Git rules (399 lines)
- `.claude/rules/build-rules.md` - Build rules (331 lines)
- `.claude/rules/quick-reference.md` - Cheat sheet (285 lines)

**Total always-on: ~1,300 lines**

### Context-Aware (Load Based on File Type)
- `.claude/rules/components/generic-table.md` - When working with `components/table/`
- `.claude/rules/components/url-sync.md` - When working with `hooks/` or pages
- `.claude/rules/components/store-pattern.md` - When working with `stores/`
- `.claude/rules/workflows/new-feature-checklist.md` - When building new features
- `.claude/rules/workflows/new-dashboard.md` - When creating dashboards
- `.claude/rules/workflows/add-metric.md` - When editing column configs
- `.claude/rules/workflows/add-dimension.md` - When editing dimensions
- `.claude/rules/workflows/standalone-component.md` - When creating components

**Total context-aware: ~2,700 lines (load only when relevant)**

### Reference (Use When Needed)
- `.claude/docs/api.md` - API patterns, query builders
- `.claude/docs/state.md` - State management details
- `.claude/docs/design.md` - UI components, layouts
- `.claude/docs/css.md` - Styling approach, Ant overrides
- `.claude/docs/features.md` - Feature-specific implementations
- `.claude/docs/mariadb.md` - CRM database guide (3700+ lines)

---

## Working Principles

1. **Review before building** - Check existing patterns first
2. **DRY** - Reuse GenericDataTable, useGenericUrlSync
3. **Data-forward** - Clarity, scannability, density
4. **Hierarchical core** - Expansion/collapse critical
5. **Follow patterns** - Don't introduce new ways
6. **Use tokens** - Never hardcode values
7. **Test with real data** - Large numbers, long text
8. **Accessibility** - Keyboard nav, focus states

---

## Quick Commands

```bash
# Development
npm run dev         # Start dev server
npm run build       # Build + type-check
npm run lint        # ESLint

# Git (push requires user permission)
git status
git commit -m "feat: Description"
# ASK USER before: git push

# Search for patterns
grep -r "pattern" components/
find . -name "*Similar*"
```

---

## When Stuck

1. **Check cheat sheet**: `.claude/rules/quick-reference.md`
2. **Search similar code**: `grep -r "pattern" components/`
3. **Read workflow**: `.claude/rules/workflows/*.md`
4. **Check template**: `.claude/rules/components/*.md`
5. **Review docs**: `.claude/docs/*.md`

---

## Documentation Maintenance

**Rule**: Update docs when making changes affecting patterns/conventions

**Timing**:
1. Implement code change
2. Test it works
3. Update docs (before commit)
4. Commit code + docs together

**What to update**:
- API patterns → `.claude/docs/api.md`
- UI patterns → `.claude/docs/design.md`
- State patterns → `.claude/docs/state.md`
- Workflows → `.claude/rules/workflows/*.md`
- Core changes → `.claude/CLAUDE.md`

---

## Component Library Split

| Use Case | Library | Examples |
|----------|---------|----------|
| Data-heavy | Ant Design | Table, Form, DatePicker, Modal |
| Layout | shadcn/ui | Sidebar, Card, Dialog, Tabs |
| Custom | CSS Module + Tailwind | Unique UI |

---

## Known Issues

- No tests
- Large bundle (Ant + shadcn)
- No dark mode
- No table virtualization

---

**For detailed information, see:**
- Cheat sheet: `.claude/rules/quick-reference.md`
- Full workflows: `.claude/rules/workflows/`
- Component templates: `.claude/rules/components/`
- Deep dives: `.claude/docs/`
