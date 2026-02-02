---
paths:
  - "config/**/*columns*.ts"
  - "config/**/*Columns*.ts"
  - "lib/server/**/*queryBuilder*.ts"
  - "lib/server/**/*QueryBuilder*.ts"
  - "types/**/*.ts"
---

# Workflow: Add Metric Column to Existing Report

## Overview
Use this workflow when adding a new metric column to an existing dashboard or report.

## Files to Modify
**Expect to modify 3-4 files**:
1. Type definition
2. Column configuration
3. Query builder
4. (Optional) Column store default visibility

## Step-by-Step Implementation

### Step 1: Add to Type Definition

**File**: `types/report.ts` or `types/onPageReport.ts`

```typescript
export interface ReportRow extends BaseTableRow {
  metrics: {
    existingMetric: number;
    newMetric: number; // ← ADD THIS
  };
}
```

**Key points**:
- Add the new metric property to the `metrics` object
- Use appropriate type (number, string, Date, etc.)
- Consider if it can be null/undefined

### Step 2: Add to Column Configuration

**File**: `config/columns.ts` or `config/onPageColumns.ts`

```typescript
export const METRIC_COLUMNS: MetricColumn[] = [
  // ... existing columns
  {
    id: 'newMetric',
    label: 'New Metric Full Name',
    shortLabel: 'Short',
    description: 'Tooltip description explaining what this metric means',
    format: 'number', // 'number' | 'percentage' | 'currency' | 'decimal' | 'time'
    category: 'basic', // or 'advanced', 'engagement', etc.
    defaultVisible: true, // Should it show by default?
    width: 120, // Column width in pixels
    align: 'right', // 'left' | 'center' | 'right'
  },
];
```

**Format options**:
- `'number'` - Integer with commas (e.g., 1,234)
- `'percentage'` - Percentage with 1 decimal (e.g., 12.3%)
- `'currency'` - Dollar amount (e.g., $1,234.56)
- `'decimal'` - Decimal with 2 places (e.g., 12.34)
- `'time'` - Duration in HH:MM:SS format

**Category guidelines**:
- `'basic'` - Core KPIs everyone needs
- `'advanced'` - Power user metrics
- `'engagement'` - User behavior metrics
- `'conversion'` - Conversion funnel metrics

### Step 3: Update Query Builder

**File**: `lib/server/queryBuilder.ts` or `lib/server/onPageQueryBuilder.ts`

Add the new metric to your SQL query:

```typescript
const query = `
  SELECT
    ${groupByColumns},
    SUM(existing_metric) as existing_metric,
    SUM(new_metric_column) as new_metric  -- ← ADD THIS
  FROM table
  WHERE date >= $1 AND date <= $2
  GROUP BY ${groupByColumns}
`;
```

**Important considerations**:

**Database placeholders**:
- PostgreSQL: Use `$1, $2, $3` (NEVER use `?`)
- MariaDB: Use `?, ?, ?` (NEVER use `$1`)

**Aggregation functions**:
- `SUM()` - Total across rows
- `AVG()` - Average value
- `MAX()` - Maximum value
- `MIN()` - Minimum value
- `COUNT()` - Count of rows

**Column aliases**:
- Use `as new_metric` to match your TypeScript property name
- Alias must match the property in your type definition

### Step 4 (Optional): Update Default Visible Columns

**File**: `stores/columnStore.ts` or `stores/onPageColumnStore.ts`

If your new metric should be visible by default, add it to the initial state:

```typescript
const useColumnStore = create<ColumnStoreState>()(
  persist(
    (set) => ({
      visibleColumns: [
        'existingMetric',
        'newMetric', // ← ADD THIS
      ],
      // ...
    }),
    {
      name: 'column-preferences',
    }
  )
);
```

**When to add**:
- ✅ Core metric everyone needs (set `defaultVisible: true`)
- ❌ Advanced metric for power users only (leave as opt-in)

### Step 5: Add to Column Group (Optional)

If using column groups, add the metric to the appropriate group:

```typescript
export const COLUMN_GROUPS: ColumnGroup[] = [
  {
    title: 'Basic Metrics',
    metricIds: ['existingMetric', 'newMetric'] // ← ADD HERE
  },
];
```

### Step 6: Test

```bash
# Build to check for type errors
npm run build

# Run dev server
npm run dev
```

**Verification checklist**:
- [ ] Column appears in table
- [ ] Column visibility toggle works
- [ ] Data displays correctly with proper formatting
- [ ] Sorting works (if sortable)
- [ ] Column width is appropriate
- [ ] Tooltip shows correct description
- [ ] Column appears in correct group (if using groups)

## Common Issues

### Issue: Column shows "undefined" or blank
**Causes**:
1. Query alias doesn't match TypeScript property name
2. Database column doesn't exist
3. Aggregation function wrong (e.g., AVG on string)

**Solutions**:
1. Check `as new_metric` matches `newMetric` in type
2. Verify column exists in database: `SELECT new_metric_column FROM table LIMIT 1`
3. Use appropriate aggregation for data type

### Issue: TypeScript error "Property does not exist"
**Cause**: Type definition not updated
**Solution**: Add property to interface in step 1

### Issue: Format not applied (wrong number display)
**Cause**: Format string in column config is wrong
**Solution**: Verify format is one of: 'number', 'percentage', 'currency', 'decimal', 'time'

### Issue: Column not visible by default
**Cause**: Not added to default visible columns
**Solution**: Either:
1. Set `defaultVisible: true` in column config, OR
2. Add to `visibleColumns` array in column store

## Related Documentation
- See `.claude/docs/api.md` for query builder patterns
- See `.claude/docs/state.md` for column store details
- See `types/table.ts` for MetricColumn interface
- See `lib/formatters.ts` for custom formatting functions
