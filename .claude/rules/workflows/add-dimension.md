---
paths:
  - "types/**/*dimension*.ts"
  - "types/**/*Dimension*.ts"
  - "lib/server/**/*queryBuilder*.ts"
  - "lib/server/**/*QueryBuilder*.ts"
  - "components/filters/**/*.tsx"
  - "components/**/Dimension*.tsx"
---

# Workflow: Add Dimension to Existing Report

## Overview
Use this workflow when adding a new dimension (grouping option) to an existing dashboard or report.

## Files to Modify
**Expect to modify 3 files**:
1. Dimension definitions
2. Query builder GROUP BY logic
3. Dimension picker UI

## Step-by-Step Implementation

### Step 1: Add to Available Dimensions

**File**: `types/dimensions.ts`

```typescript
export const AVAILABLE_DIMENSIONS = [
  { id: 'campaign', label: 'Campaign', dbColumn: 'campaign_name' },
  { id: 'adGroup', label: 'Ad Group', dbColumn: 'ad_group_name' },
  { id: 'keyword', label: 'Keyword', dbColumn: 'keyword_text' },
  { id: 'newDim', label: 'New Dimension', dbColumn: 'new_dim_column' }, // ← ADD
] as const;
```

**Key points**:
- `id` - Internal identifier (camelCase)
- `label` - Display name shown to users
- `dbColumn` - Actual database column name
- Add to end of array to preserve hierarchy order

### Step 2: Update Query Builder GROUP BY Logic

**File**: `lib/server/queryBuilder.ts` or `lib/server/dashboardQueryBuilder.ts`

#### Option A: Simple Column Map
```typescript
function buildGroupByClause(dimensions: string[]): string {
  const columnMap: Record<string, string> = {
    campaign: 'campaign_name',
    adGroup: 'ad_group_name',
    keyword: 'keyword_text',
    newDim: 'new_dim_column', // ← ADD THIS
  };

  return dimensions.map(dim => columnMap[dim]).join(', ');
}
```

#### Option B: Complex Join Logic
If your dimension requires joins:

```typescript
function buildQueryWithDimensions(dimensions: string[]) {
  let joins = '';
  let groupByColumns: string[] = [];

  dimensions.forEach(dim => {
    switch(dim) {
      case 'campaign':
        groupByColumns.push('campaign_name');
        break;
      case 'newDim':
        joins += 'LEFT JOIN new_table ON main.id = new_table.main_id ';
        groupByColumns.push('new_table.new_dim_column');
        break;
      // ... other cases
    }
  });

  return {
    joins,
    groupBy: groupByColumns.join(', ')
  };
}
```

### Step 3: Update SELECT Clause

Add the dimension to your SELECT statement:

```typescript
const selectColumns = dimensions.map(dim => {
  const columnMap: Record<string, string> = {
    campaign: 'campaign_name',
    adGroup: 'ad_group_name',
    newDim: 'new_dim_column', // ← ADD THIS
  };
  return columnMap[dim];
}).join(', ');

const query = `
  SELECT
    ${selectColumns},
    SUM(metric1) as metric1,
    SUM(metric2) as metric2
  FROM table
  WHERE date >= $1 AND date <= $2
  GROUP BY ${selectColumns}
`;
```

### Step 4: Add to Dimension Picker Dropdown

**File**: `components/filters/DimensionPicker.tsx` or `components/dashboard/DashboardDimensionPicker.tsx`

```typescript
const dimensionOptions = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'adGroup', label: 'Ad Group' },
  { value: 'keyword', label: 'Keyword' },
  { value: 'newDim', label: 'New Dimension' }, // ← ADD THIS
];
```

**Or if using AVAILABLE_DIMENSIONS directly**:
```typescript
import { AVAILABLE_DIMENSIONS } from '@/types/dimensions';

const dimensionOptions = AVAILABLE_DIMENSIONS.map(dim => ({
  value: dim.id,
  label: dim.label,
}));
```

### Step 5: Test

```bash
# Build to check for type errors
npm run build

# Run dev server
npm run dev
```

**Verification checklist**:
- [ ] Dimension appears in picker dropdown
- [ ] Can add dimension to active filters
- [ ] Data loads correctly with new dimension
- [ ] Hierarchy works (expand/collapse)
- [ ] Dimension can be reordered (drag-and-drop)
- [ ] URL updates with new dimension
- [ ] Removing dimension works

**Test dimension combinations**:
1. Single dimension: Just the new dimension
2. Multiple dimensions: New dimension + existing ones
3. Different orders: New dimension first, middle, last
4. Edge cases: Empty data, very long dimension values

## Common Issues

### Issue: "Unknown dimension" error
**Causes**:
1. Column map not updated in query builder
2. Typo in dimension ID
3. Database column doesn't exist

**Solutions**:
1. Add dimension to `columnMap` in step 2
2. Verify ID matches in all 4 files
3. Check database: `SELECT new_dim_column FROM table LIMIT 1`

### Issue: Data not grouping correctly
**Causes**:
1. Dimension not in GROUP BY clause
2. Wrong column name in GROUP BY
3. NULL values in dimension column

**Solutions**:
1. Verify `buildGroupByClause` includes new dimension
2. Check dbColumn matches actual database column
3. Handle NULLs: `COALESCE(new_dim_column, 'Unknown')`

### Issue: Dimension order affects results
**Cause**: Array position determines hierarchy depth
**Solution**: Ensure dimension order is preserved:
```typescript
// CORRECT - order matters
dimensions = ['campaign', 'adGroup', 'newDim']

// These produce different hierarchies:
// 1. campaign > adGroup > newDim
// 2. campaign > newDim > adGroup
```

### Issue: Dimension values not displaying
**Causes**:
1. SELECT clause missing dimension column
2. Column alias incorrect
3. Data processing not handling new dimension

**Solutions**:
1. Add dimension to SELECT: `SELECT new_dim_column, ...`
2. Verify alias matches TypeScript property name
3. Check row building logic includes dimension value

### Issue: Hierarchical keys not working
**Cause**: Key format doesn't follow `parent::child::value` pattern
**Solution**: Ensure keys use `::` separator:
```typescript
// CORRECT
key: 'Campaign1::AdGroup2::NewDimValue'

// WRONG
key: 'Campaign1-AdGroup2-NewDimValue'
```

## Advanced: Dimension with Calculated Values

If your dimension requires calculation or transformation:

```typescript
const query = `
  SELECT
    ${groupByColumns},
    CASE
      WHEN new_column > 100 THEN 'High'
      WHEN new_column > 50 THEN 'Medium'
      ELSE 'Low'
    END as new_dim_column,
    SUM(metric1) as metric1
  FROM table
  GROUP BY ${groupByColumns}, new_dim_column
`;
```

## Advanced: Dimension with Multiple Columns

If your dimension combines multiple database columns:

```typescript
const query = `
  SELECT
    ${groupByColumns},
    CONCAT(first_name, ' ', last_name) as new_dim_column,
    SUM(metric1) as metric1
  FROM table
  GROUP BY ${groupByColumns}, new_dim_column
`;
```

## Related Documentation
- See `.claude/docs/api.md` for query builder patterns
- See `.claude/docs/state.md` for dimension state management
- See `types/dimensions.ts` for dimension type definitions
- See `lib/server/queryBuilder.ts` for hierarchy key format
