# New Orders Dashboard - Implementation Plan

## Overview

Build a hierarchical New Orders Dashboard displaying subscription data from MariaDB in a 3-level hierarchy (Country → Product → Individual Orders) using the existing GenericDataTable pattern.

**Hierarchy:**
- Level 0: Country (DENMARK, SWEDEN, etc.)
- Level 1: Product (T-Formula, Balansera, FlexRepair, etc.)
- Level 2: Individual Orders with details

**Metrics:** Subscriptions, OTS, Trials, Customers

**Data Source:** MariaDB (subscription, invoice, customer, product, source tables)

**Pattern:** Follow marketing-report and on-page-analysis patterns exactly

---

## Files to Create

### 1. Types
**File:** `types/newOrders.ts`

Define `NewOrdersRow extends BaseTableRow` with metrics:
- subscriptions: number
- ots: number
- trials: number
- customers: number

Key format: `country::product::subscription_id` with `::` separators

### 2. Column Configuration
**File:** `config/newOrdersColumns.ts`

Define 4 metric columns (all default visible):
- Subscriptions (120px, right-align)
- OTS (100px, right-align)
- Trials (100px, right-align)
- Customers (110px, right-align)

Single column group: "Order Metrics"

### 3. Query Builder
**File:** `lib/server/newOrdersQueryBuilder.ts`

Transform the provided SQL into 3 depth-aware queries:

**Depth 0 (Country aggregation):**
```sql
SELECT
  cu.country,
  COUNT(DISTINCT s.id) AS subscription_count,
  SUM(CASE WHEN uo.type = 3 THEN 1 ELSE 0 END) AS ots_count,
  COUNT(DISTINCT i.id) AS trial_count,
  COUNT(DISTINCT s.customer_id) AS customer_count
FROM subscription s
LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
LEFT JOIN customer cu ON cu.id = s.customer_id
LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
  AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
  AND uo.type = 3
WHERE s.date_create BETWEEN ? AND ?
GROUP BY cu.country
ORDER BY subscription_count DESC
```

**Depth 1 (Product aggregation within country):**
Add `p.product_name` to SELECT and GROUP BY, filter by `cu.country = ?`

**Depth 2 (Individual subscriptions):**
Return individual rows with actual OTS/trial counts per subscription:
```sql
SELECT
  s.id AS subscription_id,
  cu.country,
  p.product_name,
  sr.source,
  COUNT(DISTINCT CASE WHEN uo.type = 3 THEN uo.id END) AS ots_count,
  COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count
FROM subscription s
LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
LEFT JOIN customer cu ON cu.id = s.customer_id
LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
LEFT JOIN product p ON p.id = ip.product_id
LEFT JOIN source sr ON sr.id = i.source_id
LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
  AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
WHERE s.date_create BETWEEN ? AND ?
  AND cu.country = ?
  AND p.product_name = ?
GROUP BY s.id, cu.country, p.product_name, sr.source
ORDER BY s.id DESC
```

**Key Points:**
- Use `?` placeholders (MariaDB style)
- Date format: `YYYY-MM-DD HH:MM:SS` (use 00:00:00 and 23:59:59)
- Parent filters: Build WHERE clause dynamically
- OTS detection: `uo.type = 3` (from invoice table)
- Trial detection: `i.type = 1` (from invoice table)
- Limit: 1000 rows max

### 4. API Route
**File:** `app/api/new-orders/query/route.ts`

POST endpoint that:
1. Validates request (dateRange, dimensions, depth)
2. Converts ISO strings to Date objects
3. Calls query builder with appropriate depth
4. Executes query via `executeMariaDBQuery`
5. Transforms results to `NewOrdersRow[]` format

**Attribute Formatting by Depth:**
- Depth 0: `row.country || '(not set)'`
- Depth 1: `row.product_name || '(not set)'`
- Depth 2: `ID: ${row.subscription_id} ${row.product_name} - ${row.source}`
  - Note: product_name contains campaign details like "(25% price increase)_40% trial"

**Response Format:**
```typescript
{ success: true, data: NewOrdersRow[] }
// or
{ success: false, error: string }
```

### 5. API Client
**File:** `lib/api/newOrdersClient.ts`

Fetch wrapper with:
- 30s timeout
- Error normalization
- Date serialization
- POST to `/api/new-orders/query`

Pattern: Copy from `lib/api/client.ts`, change endpoint

### 6. Store
**File:** `stores/newOrdersStore.ts`

Zustand store with dual-state pattern:

**State:**
- dateRange (active), loadedDateRange (server truth)
- dimensions (active), loadedDimensions (server truth)
- reportData: NewOrdersRow[]
- expandedRowKeys: string[]
- sortColumn, sortDirection
- isLoading, hasUnsavedChanges, hasLoadedOnce, error

**Actions:**
- loadData() - Fetch depth 0, restore expanded rows
- loadChildData(parentKey, parentValue, depth) - Lazy load children
- setDateRange(), setDimensions(), setSort()
- resetFilters() - Revert to loaded state

**Defaults:**
- dateRange: Today (00:00:00 - 23:59:59)
- dimensions: `['country', 'product']`
- sortColumn: `'subscriptions'`
- sortDirection: `'descend'`

Pattern: 98% identical to `reportStore.ts`

### 7. Column Store
**File:** `stores/newOrdersColumnStore.ts`

Persist column visibility to localStorage:
- Key: `'new-orders-column-settings'`
- Version: 1
- Default: All 4 columns visible

Pattern: Copy from `onPageColumnStore.ts`

### 8. URL Sync Hook
**File:** `hooks/useNewOrdersUrlSync.ts`

Thin wrapper around `useGenericUrlSync`:
```typescript
export function useNewOrdersUrlSync() {
  return useGenericUrlSync<NewOrdersRow>({
    useStore: useNewOrdersStore,
    fetchData: fetchNewOrdersData,
    defaultSortColumn: 'subscriptions',
  });
}
```

### 9. Data Table Component
**File:** `components/new-orders/NewOrdersDataTable.tsx`

Wrapper around GenericDataTable:
```typescript
<GenericDataTable<NewOrdersRow>
  useStore={useNewOrdersStore}
  useColumnStore={useNewOrdersColumnStore}
  metricColumns={NEW_ORDERS_METRIC_COLUMNS}
  columnGroups={NEW_ORDERS_COLUMN_GROUPS}
  colorClassName={styles.newOrdersColors}
  showColumnTooltips={true}
/>
```

### 10. Styles
**File:** `components/new-orders/NewOrdersDataTable.module.css`

Theme customization using design tokens:
- Expand icon color: `var(--color-accent)`
- Row hover: `var(--color-row-hover)`
- Expanded row: `var(--color-expanded-row)`

### 11. Page
**File:** `app/new-orders/page.tsx`

Client component:
```typescript
'use client';
export default function NewOrdersPage() {
  useNewOrdersUrlSync();
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-semibold">New Orders</h1>
      <NewOrdersDataTable />
    </div>
  );
}
```

---

## Critical Implementation Details

### SQL Transformation Strategy

The provided SQL is a flat query that returns individual subscription rows. We need to transform this into hierarchical queries:

**Original SQL Structure:**
- JOINs subscription → invoice → customer → product → source
- LEFT JOINs for upsells and trials
- GROUP BY s.id (subscription level)
- WHERE date filter hardcoded

**Transformation:**
1. **Extract core joins** - Keep subscription, customer, product, source, invoice joins
2. **Add depth-aware GROUP BY**:
   - Depth 0: `GROUP BY country`
   - Depth 1: `GROUP BY country, product_name`
   - Depth 2: `GROUP BY subscription_id` (with additional detail fields)
3. **Add parent filters** - WHERE clauses for country/product based on expansion
4. **Parameterize date range** - Replace hardcoded dates with `?` placeholders
5. **Calculate metrics**:
   - OTS: Count invoices where `uo.type = 3`
   - Trials: Count invoices where `i.type = 1`
   - Subscriptions: Count distinct subscription IDs
   - Customers: Count distinct customer IDs

### MariaDB Table Relationships

Based on provided SQL:
- `subscription` - Main table (id, customer_id, date_create, status)
- `invoice` - Order/trial records (subscription_id, type, customer_id, tag)
  - type = 1: Trial
  - type = 3: OTS upsell
  - tag contains parent subscription reference
- `customer` - Customer details (id, country, city, firstname, lastname)
- `product` - Product info (id, name, sku)
  - **Note:** product.name contains campaign details like "(25% price increase)"
- `source` - Traffic source (id, name)
- `invoice_product` - Links invoices to products

### Key Formatting at Each Depth

**Depth 0 (Country):**
- Key: `"DENMARK"`
- Attribute: `"DENMARK"`

**Depth 1 (Product within Country):**
- Key: `"DENMARK::T-Formula"`
- Attribute: `"T-Formula"`

**Depth 2 (Individual Order):**
- Key: `"DENMARK::T-Formula::4235"`
- Attribute: `"ID: 4235 T-Formula-DNK-x3-[166/996] (25% price increase) - Facebook"`
  - Format: `ID: {subscription_id} {product_name} - {source}`
  - product_name includes campaign details from database

### Metrics Calculation

**At Depth 0 and 1 (Aggregated):**
```sql
COUNT(DISTINCT s.id) AS subscriptions
SUM(CASE WHEN uo.type = 3 THEN 1 ELSE 0 END) AS ots
COUNT(DISTINCT i.id) AS trials  -- where i.type = 1
COUNT(DISTINCT s.customer_id) AS customers
```

**At Depth 2 (Per Subscription):**
```sql
1 AS subscriptions  -- Each row = 1 subscription
COUNT(DISTINCT CASE WHEN uo.type = 3 THEN uo.id END) AS ots
COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trials
1 AS customers  -- Each subscription = 1 customer
```

**Important:** User wants actual counts at depth 2 (not binary 1/0), so if one subscription has 3 OTS upsells, show 3.

---

## Implementation Sequence

### Phase 1: Foundation (30 min)
1. Create `types/newOrders.ts`
2. Create `config/newOrdersColumns.ts`
3. Run `npm run build` to verify types compile

### Phase 2: Data Layer (2 hours)
1. Create `lib/server/newOrdersQueryBuilder.ts`
   - Start with depth 0 query
   - Test SQL directly in MariaDB to verify results
   - Add depth 1 and 2 queries
2. Create `app/api/new-orders/query/route.ts`
   - Implement POST handler
   - Test with curl/Postman
3. Create `lib/api/newOrdersClient.ts`

**Test API Endpoint:**
```bash
curl -X POST http://localhost:3000/api/new-orders/query \
  -H "Content-Type: application/json" \
  -d '{
    "dateRange": {"start": "2026-01-28T00:00:00", "end": "2026-01-28T23:59:59"},
    "dimensions": ["country", "product"],
    "depth": 0
  }'
```

### Phase 3: State Management (1 hour)
1. Create `stores/newOrdersStore.ts`
2. Create `stores/newOrdersColumnStore.ts`
3. Create `hooks/useNewOrdersUrlSync.ts`

### Phase 4: UI Components (45 min)
1. Create `components/new-orders/NewOrdersDataTable.tsx`
2. Create `components/new-orders/NewOrdersDataTable.module.css`
3. Create `app/new-orders/page.tsx`

### Phase 5: Testing (30 min)
- Test hierarchy expansion (country → product → orders)
- Test sorting by each metric
- Test date range changes
- Test URL state persistence
- Verify attribute formatting at depth 2

---

## Testing Checklist

### API Testing
- [ ] Depth 0 query returns country aggregations
- [ ] Depth 1 query returns products within country (filtered)
- [ ] Depth 2 query returns individual orders (filtered by country + product)
- [ ] Date range filtering works (00:00:00 - 23:59:59)
- [ ] Parent filters correctly applied at each depth
- [ ] OTS count correct (type = 3 invoices)
- [ ] Trial count correct (type = 1 invoices)
- [ ] Metrics sum correctly at aggregated levels

### UI Testing
- [ ] Table renders with 3-level hierarchy
- [ ] Expand country → shows products
- [ ] Expand product → shows individual orders
- [ ] Individual order row shows correct attribute format:
  - `ID: {id} {product_name} - {source}`
- [ ] Sort by each metric column works
- [ ] Date picker updates date range
- [ ] URL updates on filter/sort changes
- [ ] URL loading restores state correctly
- [ ] Column visibility toggle works
- [ ] Loading states display correctly

### Data Validation
- [ ] No duplicate rows at any depth
- [ ] Metrics match database query results
- [ ] Product names include campaign details (from database)
- [ ] Source names correct (Facebook, DrCash, Adwords, etc.)
- [ ] Customer counts deduplicated correctly

---

## Known Risks & Mitigations

### Risk 1: Complex JOINs Creating Duplicates
**Issue:** LEFT JOINs to invoice table (for OTS and trials) can create duplicate rows if one subscription has multiple upsells or trials.

**Mitigation:**
- Use `COUNT(DISTINCT ...)` in aggregations (depth 0, 1)
- Use `GROUP BY s.id` with COUNT at depth 2 to get actual counts per subscription
- Test with subscriptions that have multiple OTS/trials

### Risk 2: Performance with Large Date Ranges
**Issue:** Query might be slow with date ranges covering thousands of subscriptions.

**Mitigation:**
- Default to today only (small dataset)
- Add LIMIT 1000 to all queries
- Recommend database indexes: `subscription(date_create)`, `invoice(subscription_id, type)`
- Show loading indicator for slow queries

### Risk 3: Product Name Formatting
**Issue:** Product names contain special characters and campaign details.

**Mitigation:**
- Use product_name directly from database (no parsing needed)
- Test with actual product names from MariaDB
- Escape special characters if needed for display

### Risk 4: Timezone Handling
**Issue:** Date comparison between user timezone and server/database timezone.

**Mitigation:**
- Use explicit time ranges: 00:00:00 to 23:59:59
- Format dates consistently: `YYYY-MM-DD HH:MM:SS`
- Document timezone assumptions (assume server local time)

---

## Configuration Defaults

```typescript
{
  dateRange: {
    start: new Date('2026-01-28T00:00:00'),
    end: new Date('2026-01-28T23:59:59')
  },
  dimensions: ['country', 'product'],
  sortColumn: 'subscriptions',
  sortDirection: 'descend',
  expandedRowKeys: []
}
```

**URL Format:**
```
/new-orders?start=2026-01-28&end=2026-01-28&dimensions=country,product&sortBy=subscriptions&sortDir=descend&expanded=DENMARK,DENMARK::T-Formula
```

---

## Critical Files

These files contain the core logic and should be reviewed carefully:

1. **`lib/server/newOrdersQueryBuilder.ts`** - SQL query generation for 3 depths
2. **`app/api/new-orders/query/route.ts`** - API orchestration and data transformation
3. **`stores/newOrdersStore.ts`** - State management with dual-state pattern
4. **`types/newOrders.ts`** - Type definitions for data contracts
5. **`config/newOrdersColumns.ts`** - Column configuration

---

## Verification Steps

After implementation, verify end-to-end:

1. **Load page** → Shows countries with today's data
2. **Expand DENMARK** → Shows products (T-Formula, Balansera, etc.)
3. **Expand T-Formula** → Shows individual orders with format:
   - `ID: 4235 T-Formula-DNK-x3-[166/996] (25% price increase) - Facebook`
4. **Check metrics**:
   - Subscriptions column shows counts at all levels
   - OTS column shows upsell counts
   - Trials column shows trial counts
   - Customers column shows unique customer counts
5. **Sort by OTS** → Table reorders by OTS count
6. **Change date to yesterday** → Data updates
7. **Copy URL** → Open in new tab → State restored

---

## Future Enhancements (Out of Scope)

- Add "Source" column to show traffic source at depth 2
- Add revenue metrics
- Add filter by source/product
- CSV export functionality
- Order detail modal on row click
- Real-time updates via WebSocket
- Trend charts above table

---

## Database Schema Notes

Based on SQL analysis:

**Tables Used:**
- `subscription` (s) - Main entity
- `invoice` (i, uo) - Orders/trials/upsells
- `customer` (cu) - Customer data
- `product` (p) - Product catalog
- `source` (sr) - Traffic sources
- `invoice_product` (ip) - Invoice-product linking
- `invoice_processed` (ipr) - Payment status
- `subscription_cancel_reason` (scr) - Cancellation data
- `cancel_reason` (cr) - Cancellation reasons

**Key Relationships:**
- subscription.customer_id → customer.id
- subscription.id ← invoice.subscription_id
- invoice.id → invoice_product.invoice_id
- invoice_product.product_id → product.id
- invoice.source_id → source.id

**Invoice Types:**
- type = 1: Trial order
- type = 3: OTS (one-time sale) upsell
- type = 4: Refund

**Upsell Detection:**
- Join condition: `invoice.tag LIKE CONCAT('%parent-sub-id=', subscription.id, '%')`
- Filter by type = 3 for OTS

---

## Notes

- Product name format includes campaign details: e.g., "T-Formula-DNK-x3-[166/996] (25% price increase)_40% trial"
- Source is NOT a dimension - shown as detail in attribute text and Source column
- All patterns follow existing marketing-report and on-page-analysis implementations
- Use design tokens from `styles/tokens.css` for consistency
- GenericDataTable handles all table rendering, sorting, expansion logic
