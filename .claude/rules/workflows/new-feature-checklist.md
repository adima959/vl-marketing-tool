---
paths:
  - "app/**/page.tsx"
  - "app/api/**/route.ts"
  - "components/**/*.tsx"
  - "types/**/*.ts"
  - "config/**/*.ts"
  - "stores/**/*.ts"
  - "hooks/**/*.ts"
---

# Workflow: New Feature Development Checklist

## Overview
Use this checklist when building ANY new feature to ensure you review existing patterns before creating new code.

## CRITICAL RULE
**ALWAYS review existing components FIRST** - Most dashboard features can reuse GenericDataTable, useGenericUrlSync, or existing patterns.

## Step 1: Review (MANDATORY - Do BEFORE Planning)

**When to review**: Immediately after receiving the task, before reading files or planning.

### Search for Similar Components

Run these searches to find similar patterns:

```bash
# Search by component type
grep -r "GenericDataTable" components/
grep -r "useGenericUrlSync" hooks/

# Search by feature
grep -r "expandable" components/
grep -r "hierarchical" components/
grep -r "drill-down" components/

# Search by domain
find . -name "*Report*"
find . -name "*Analysis*"
find . -name "*Dashboard*"

# Search by interaction pattern
grep -r "expand" components/
grep -r "collapse" components/
grep -r "filter" components/
```

### Similarity Criteria Checklist

Search for existing components matching ANY of these:

- [ ] **Same data structure**: Hierarchical rows, expandable tables
- [ ] **Same interaction**: Drill-down, filtering, sorting
- [ ] **Same domain**: Reports, analytics, dashboards
- [ ] **Same UI pattern**: Two-row headers, fixed columns, grouped metrics
- [ ] **Same state needs**: URL sync, persistence, loading states
- [ ] **Same API pattern**: POST with dimensions/dateRange

### Check Generic Applicability

- [ ] Is this a hierarchical table? → Consider GenericDataTable
- [ ] Need URL-synced filters? → Consider useGenericUrlSync
- [ ] Similar to existing reports? → Review DataTable, OnPageDataTable

### Stop If Generic Applies

**If you found similar patterns → STOP**
Do NOT proceed to Step 2. Use existing patterns.

## Step 2: Calculate Similarity Score

Only reach this step if generic patterns might apply. Calculate reusability:

### Similarity Checklist (Each = 20%)

1. [ ] **Same data structure** (hierarchical rows with children) = 20%
2. [ ] **Same interactions** (expand/collapse, sorting, filtering) = 20%
3. [ ] **Same column structure** (attributes + metric groups) = 20%
4. [ ] **Same state management** (URL sync, persistence) = 20%
5. [ ] **Same loading patterns** (parent data + lazy children) = 20%

### Decision Matrix

**Total score → Action**:
- **80-100% (4-5 boxes)**: ✅ Use/extend generic components
  - Example: New report with hierarchical data
  - Action: Copy template from `.claude/rules/workflows/new-dashboard.md`

- **60-80% (3 boxes)**: 🤔 Strongly consider generic with customization
  - Example: Report with unique metric calculations
  - Action: Extend GenericDataTable, override specific methods

- **40-60% (2 boxes)**: ⚖️ Evaluate case-by-case
  - Example: Table with some hierarchy but unique UI
  - Action: Discuss with team, consider hybrid approach

- **0-40% (0-1 boxes)**: ❌ Build custom component
  - Example: Unique visualization, non-table UI
  - Action: Use `.claude/rules/workflows/standalone-component.md`

## Step 3: Choose Implementation Path

### Path A: Reuse Generic (80-100% similarity)

**Follow this workflow**:
1. See `.claude/rules/workflows/new-dashboard.md` for full guide
2. Copy template from existing report (DataTable or OnPageDataTable)
3. Customize only domain-specific logic (API endpoint, metrics, dimensions)
4. Test with real data

**Example**: Adding a new "Keywords Report"
- ✅ Uses hierarchical data (campaign > ad group > keyword)
- ✅ Same interactions (expand, filter, sort)
- ✅ Same state needs (URL sync, date range)
- → Reuse GenericDataTable pattern

### Path B: Extend Generic (60-80% similarity)

**Customization points**:
- Custom cell renderers
- Additional actions in rows
- Unique metric formatting
- Special filtering logic

**Implementation**:
```typescript
import { GenericDataTable } from '@/components/table/GenericDataTable';
import type { GenericDataTableConfig } from '@/types/table';

// Custom config with overrides
const customConfig: GenericDataTableConfig = {
  // ... standard config
  renderCustomCell: (record, column) => {
    // Custom rendering logic
  },
  onRowAction: (key, action) => {
    // Custom row actions
  },
};

export function CustomDataTable() {
  return <GenericDataTable {...customConfig} />;
}
```

### Path C: Build Custom (0-40% similarity)

**Follow this workflow**:
1. See `.claude/rules/workflows/standalone-component.md`
2. Choose component library (Ant Design vs shadcn/ui vs custom)
3. Create component with CSS Module
4. Document why custom approach needed (in PR description)

**Example**: Custom chart visualization
- ❌ Not a table
- ❌ Unique interaction pattern
- → Build custom component

## Step 4: Implement

Based on chosen path:

### If Reusing Generic:
- [ ] Copy template from `.claude/rules/workflows/new-dashboard.md`
- [ ] Create types (extend BaseTableRow)
- [ ] Create column config (MetricColumn[])
- [ ] Create store (copy reportStore pattern)
- [ ] Create API route
- [ ] Create wrapper components
- [ ] Test end-to-end

### If Building Custom:
- [ ] Follow `.claude/rules/workflows/standalone-component.md`
- [ ] Choose library (Ant Design / shadcn/ui / custom)
- [ ] Create component structure
- [ ] Implement with CSS Module using design tokens
- [ ] Export from index
- [ ] Test all interactions

## Step 5: Document

### Update Documentation If:
- [ ] You created a NEW pattern (not using existing)
- [ ] You extended generic in a reusable way
- [ ] You found a better approach to existing pattern

### What to Document:
1. **If new pattern**: Update `.claude/docs/` with detailed guide
2. **If reusable extension**: Add example to `.claude/rules/components/`
3. **If workflow change**: Update relevant workflow in `.claude/rules/workflows/`

### Where to Document:
- **Core patterns**: `.claude/CLAUDE.md` quick reference
- **Detailed guides**: `.claude/docs/*.md` reference material
- **Workflows**: `.claude/rules/workflows/*.md` step-by-step guides
- **Templates**: `.claude/rules/components/*.md` reusable templates

## Common Mistakes

### Mistake 1: Skipping Review Step
**Problem**: Building from scratch when similar component exists
**Impact**: Duplicate code, inconsistent patterns, wasted time
**Solution**: ALWAYS run searches in Step 1 before planning

### Mistake 2: Not Calculating Similarity
**Problem**: Choosing wrong implementation path (custom when generic would work)
**Impact**: More code to maintain, inconsistency across features
**Solution**: Use the 5-point checklist, be honest about similarity score

### Mistake 3: Copy-Paste Without Understanding
**Problem**: Copying template but not understanding how it works
**Impact**: Bugs when customizing, can't debug issues
**Solution**: Read through template code, understand each section before modifying

### Mistake 4: Not Documenting New Patterns
**Problem**: Creating reusable pattern but not documenting it
**Impact**: Others recreate the same pattern, knowledge lost
**Solution**: Always document new patterns (Step 5)

### Mistake 5: Over-Engineering
**Problem**: Adding features not requested "just in case"
**Impact**: Increased complexity, harder to maintain
**Solution**: Only build what's requested, document future enhancements separately

## Real-World Examples

### Example 1: New "Conversions Report"
**Analysis**:
- ✅ Hierarchical data (source > medium > campaign)
- ✅ Expand/collapse navigation
- ✅ Multiple metric columns
- ✅ Date range filter
- ✅ URL-synced state

**Similarity Score**: 100% (5/5 boxes checked)
**Decision**: Use GenericDataTable pattern
**Implementation**: Follow `.claude/rules/workflows/new-dashboard.md`

### Example 2: Custom Chart Dashboard
**Analysis**:
- ❌ Not a table (chart visualization)
- ❌ Different interaction (zoom, pan)
- ❌ No hierarchy
- ❌ Different state needs (chart config)

**Similarity Score**: 0% (0/5 boxes checked)
**Decision**: Build custom component
**Implementation**: Follow `.claude/rules/workflows/standalone-component.md`

### Example 3: Report with Unique Cell Actions
**Analysis**:
- ✅ Hierarchical table structure
- ✅ Standard expand/collapse
- ✅ Metric columns
- ❌ Unique cell actions (edit inline)
- ✅ Standard filters

**Similarity Score**: 80% (4/5 boxes checked)
**Decision**: Extend GenericDataTable with custom cell renderer
**Implementation**: Use GenericDataTable + custom renderCell function

## Quick Reference

### When to Use What

| Feature Type | Similarity | Use | Workflow |
|-------------|-----------|-----|----------|
| Hierarchical report | 80-100% | GenericDataTable | `new-dashboard.md` |
| Add metric to existing | N/A | Modify existing | `add-metric.md` |
| Add dimension to existing | N/A | Modify existing | `add-dimension.md` |
| Custom visualization | 0-40% | Custom component | `standalone-component.md` |
| Unique table variant | 60-80% | Extend generic | Custom + generic base |

## Related Documentation
- See `.claude/rules/workflows/new-dashboard.md` for full dashboard workflow
- See `.claude/rules/workflows/standalone-component.md` for custom components
- See `.claude/rules/components/generic-table.md` for GenericDataTable details
- See `.claude/docs/design.md` for UI patterns
- See `.claude/docs/state.md` for state management patterns
