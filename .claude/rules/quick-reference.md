# Quick Reference Cheat Sheet

Fast lookups for common operations. For detailed workflows, see full workflow files.

---

## Critical Warnings (Memorize)

⚠️ **Database**: PostgreSQL = `$1, $2` | MariaDB = `?, ?` (NEVER mix)
⚠️ **Table Scroll**: NEVER `'max-content'`, ALWAYS `350 + totalWidth`
⚠️ **Git Push**: NEVER auto-push, ALWAYS ask user first
⚠️ **Load Data**: ONLY button triggers fetch, not filter changes
⚠️ **Imports**: ALWAYS `@/` absolute paths, NOT relative

---

## 5-Minute Checklists

### New Dashboard
```bash
# 1. Types → 2. Columns → 3. Store → 4. API → 5. Components → 6. Page → 7. Test
touch types/myReport.ts config/myColumns.ts
cp stores/reportStore.ts stores/myStore.ts
touch app/api/my-report/query/route.ts
touch components/my-report/MyDataTable.tsx hooks/useMyUrlSync.ts
touch app/my-report/page.tsx
npm run build && npm run dev
```
Full: `.claude/rules/workflows/new-dashboard.md`

### Add Metric
```typescript
// 1. types/report.ts → 2. config/columns.ts → 3. queryBuilder.ts → 4. Test
metrics: { newMetric: number }
{ id: 'newMetric', label: '...', format: 'number', width: 120 }
SUM(new_metric_column) as new_metric
```
Full: `.claude/rules/workflows/add-metric.md`

### Add Dimension
```typescript
// 1. types/dimensions.ts → 2. queryBuilder.ts → 3. DimensionPicker.tsx
{ id: 'newDim', label: '...', dbColumn: 'new_dim_column' }
columnMap = { newDim: 'new_dim_column' }
{ value: 'newDim', label: '...' }
```
Full: `.claude/rules/workflows/add-dimension.md`

---

## Common Commands

```bash
# Development
npm run dev    npm run build    npm run lint

# Git (push = ask first)
git status    git diff    git commit -m "feat: ..."

# Search
grep -r "pattern" components/
find . -name "*Similar*"

# Database
# PostgreSQL: $1, $2    MariaDB: ?, ?
```

---

## Design Tokens

```css
--color-bg-primary: #ffffff    --spacing-xs: 4px   --radius-sm: 4px
--color-border: #e8eaed        --spacing-sm: 8px   --radius-md: 8px
--color-accent: #00B96B        --spacing-md: 12px  --shadow-sm: ...
```

---

## Component Library

| Need | Use |
|------|-----|
| Form, table, modal | Ant Design |
| Card, sidebar, tabs | shadcn/ui |
| Unique UI | CSS Module |

---

## Decision Trees

**Table?** → Hierarchical + metrics → **GenericDataTable**
**URL sync?** → Date/dimensions/sort → **useGenericUrlSync**
**New report?** → Similar to existing → **Copy store pattern**

---

## Build Decision

Code (`.ts`/`.css`) changed? → **Build**
Docs (`.md`/comments) only? → **Skip**

---

## Git Decision

Work complete? → **Commit**
Push? → **Ask user first**

---

## Quick Fixes

**Column undefined**: Check query alias = TS property
**Module not found**: Verify `@/` imports
**URL not updating**: Call `useUrlSync()` in page
**Columns too wide**: Calculate `scroll.x` pixels
**Push blocked**: Ask user (intentional)

---

## File Structure

```
.claude/
├── CLAUDE.md           - Core patterns
├── rules/
│   ├── quick-reference.md    - This file
│   ├── workflows/      - Step-by-step (5 files)
│   ├── components/     - Templates (3 files)
│   ├── git-workflow.md
│   └── build-rules.md
└── docs/               - Deep dives (6 files)
```

---

## When Stuck

1. Check cheat sheet (this file)
2. Search: `grep -r "pattern" components/`
3. Read workflow: `.claude/rules/workflows/*.md`
4. Check template: `.claude/rules/components/*.md`
5. Review docs: `.claude/docs/*.md`
