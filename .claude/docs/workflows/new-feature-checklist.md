# New Feature Development Rules

**ALWAYS review existing components FIRST.** Most dashboard features can reuse GenericDataTable, useGenericUrlSync, or existing patterns.

## Step 1: Search for Similar (MANDATORY before planning)

```bash
grep -r "GenericDataTable" components/
grep -r "useGenericUrlSync" hooks/
find . -name "*Report*" -o -name "*Analysis*" -o -name "*Dashboard*"
```

Check for matches on:
- Same data structure (hierarchical rows, expandable tables)
- Same interactions (drill-down, filtering, sorting)
- Same UI pattern (two-row headers, grouped metrics)
- Same state needs (URL sync, persistence, loading states)
- Same API pattern (POST with dimensions/dateRange)

**If you found similar patterns → STOP. Use existing patterns.**

## Step 2: Calculate Similarity (each = 20%)

1. Same data structure (hierarchical rows with children)
2. Same interactions (expand/collapse, sorting, filtering)
3. Same column structure (attributes + metric groups)
4. Same state management (URL sync, persistence)
5. Same loading patterns (parent data + lazy children)

## Step 3: Choose Path

| Score | Action | Source to Study |
|-------|--------|----------------|
| 80-100% | Use/extend generic components | Read existing dashboards (e.g., `app/page.tsx`, `app/on-page-analysis/`) |
| 60-80% | Extend GenericDataTable with customization | Read `components/table/GenericDataTable.tsx` |
| 40-60% | Evaluate case-by-case, consider hybrid | Discuss approach first |
| 0-40% | Build custom component | Standard React + Ant Design + CSS Modules |

**Other operations** (read existing implementations to derive pattern):
- Add metric → study existing metrics in `config/columns.ts` + query builder
- Add dimension → study existing dimensions in `config/marketingDimensions.ts` + query builder

## Step 4: Document

If you created a NEW pattern or reusable extension, update the relevant docs file.
See CLAUDE.md "Documentation Reference" for the full file map.

## Common Mistakes

- **Skipping review**: Building from scratch when similar component exists
- **Wrong path**: Choosing custom when generic would work — use the 5-point checklist
- **Copy-paste without understanding**: Read template code before modifying
- **Over-engineering**: Only build what's requested
