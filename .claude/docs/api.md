# API Patterns Reference

Dense reference for API routes, database queries, and error handling.

## Table of Contents

1. [Database Clients](#database-clients) - PostgreSQL vs MariaDB
2. [API Route Template](#api-route-template) - Copy-paste starter
3. [Response Envelope](#response-envelope) - Standard format
4. [Error Handling](#error-handling) - Patterns and helpers
5. [Query Builders](#query-builders) - Hierarchical data patterns
6. [Hierarchical Keys](#hierarchical-keys) - Key format conventions

---

## Database Clients

### PostgreSQL (Neon) - Ad Campaign Data

**File**: `lib/server/db.ts`
**Placeholder syntax**: `$1, $2, $3` (numbered)

```typescript
import { db } from '@/lib/server/db';

// Simple query
const result = await db.query(
  'SELECT * FROM campaigns WHERE date >= $1 AND date <= $2',
  [startDate, endDate]
);

// With transaction
const client = await db.getClient();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO table VALUES ($1, $2)', [val1, val2]);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

---

### MariaDB - CRM Data

**File**: `lib/server/mariadb.ts`
**Placeholder syntax**: `?` (positional)

```typescript
import { executeMariaDBQuery, testMariaDBConnection } from '@/lib/server/mariadb';

// Simple query
const data = await executeMariaDBQuery<SubscriptionRow>(
  'SELECT * FROM subscriptions WHERE created_date > ? AND status = ?',
  ['2026-01-01', 'active']
);

// Test connection
await testMariaDBConnection(); // Throws if connection fails

// Key view: real_time_subscriptions_view
// Contains 24 columns: subscription, customer, product, tracking data
const subscriptions = await executeMariaDBQuery(
  'SELECT * FROM real_time_subscriptions_view WHERE country_code = ?',
  ['US']
);
```

**Config**: `.env.local` (MARIADB_HOST, MARIADB_USER, MARIADB_PASSWORD, MARIADB_DATABASE, MARIADB_PORT)

---

## API Route Template

**File pattern**: `app/api/[feature]/[action]/route.ts`

### Standard POST Route (Query/Fetch)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/server/db';
import { z } from 'zod'; // Optional: runtime validation

// Request schema (optional but recommended)
const requestSchema = z.object({
  dimensions: z.array(z.string()),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }),
  parentKey: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate request
    const body = await request.json();

    // Optional: runtime validation
    const validated = requestSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request parameters' },
        { status: 400 }
      );
    }

    const { dimensions, dateRange, parentKey } = validated.data;

    // 2. Build query (use query builder if complex)
    const query = buildQuery(dimensions, dateRange, parentKey);

    // 3. Execute query
    const result = await db.query(query.text, query.values);

    // 4. Transform data (if needed)
    const transformedData = result.rows.map(transformRow);

    // 5. Return success response
    return NextResponse.json({
      success: true,
      data: transformedData,
    });

  } catch (error) {
    // 6. Handle errors
    console.error('API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

---

## Response Envelope

**ALWAYS use this format** (enables consistent error handling on client):

```typescript
// Success response
{
  success: true,
  data: T // Your data type
}

// Error response
{
  success: false,
  error: string // Human-readable error message
}
```

**Type definitions**:
```typescript
// types/api.ts
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
```

**Client-side usage**:
```typescript
const response = await fetch('/api/reports/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dimensions, dateRange }),
});

const result: ApiResponse<ReportRow[]> = await response.json();

if (result.success) {
  console.log(result.data); // Type-safe access
} else {
  console.error(result.error);
}
```

---

## Error Handling

### Error Types (lib/types/errors.ts)

```typescript
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Helper function
export function createValidationError(message: string): ValidationError {
  return new ValidationError(message);
}

export function createDatabaseError(message: string, error?: unknown): DatabaseError {
  return new DatabaseError(message, error);
}
```

### Error Handling Pattern

```typescript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validation errors (400)
    if (!body.dimensions || body.dimensions.length === 0) {
      throw createValidationError('At least one dimension required');
    }

    // Database errors (500)
    let result;
    try {
      result = await db.query(sql, params);
    } catch (dbError) {
      throw createDatabaseError('Query failed', dbError);
    }

    return NextResponse.json({ success: true, data: result.rows });

  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof DatabaseError) {
      console.error('Database error:', error.originalError);
      return NextResponse.json(
        { success: false, error: 'Database query failed' },
        { status: 500 }
      );
    }

    // Unknown errors
    console.error('Unknown error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## Query Builders

### Hierarchical Data Pattern

**Example**: `lib/server/queryBuilder.ts`, `lib/server/onPageQueryBuilder.ts`

```typescript
interface QueryParams {
  dimensions: string[];
  dateRange: { start: Date; end: Date };
  parentKey?: string;
}

export function buildHierarchicalQuery(params: QueryParams) {
  const { dimensions, dateRange, parentKey } = params;

  // 1. Build GROUP BY columns (dimension order = hierarchy depth)
  const groupByColumns = dimensions
    .map((dim, index) => {
      const columnMap: Record<string, string> = {
        campaign: 'campaign_name',
        adGroup: 'ad_group_name',
        keyword: 'keyword_text',
        date: 'DATE(date)',
      };
      return columnMap[dim];
    })
    .join(', ');

  // 2. Build WHERE clause
  const whereClauses = ['date >= $1', 'date <= $2'];
  const values: any[] = [dateRange.start, dateRange.end];

  // 3. Handle parent filter (for child data loading)
  if (parentKey) {
    const parentFilters = parseParentKey(parentKey, dimensions);
    parentFilters.forEach((filter, index) => {
      whereClauses.push(`${filter.column} = $${values.length + 1}`);
      values.push(filter.value);
    });
  }

  // 4. Build full query
  const query = `
    SELECT
      ${groupByColumns},
      SUM(clicks) as clicks,
      SUM(impressions) as impressions,
      SUM(cost) as cost,
      AVG(ctr) as ctr
    FROM campaign_data
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY ${groupByColumns}
    ORDER BY clicks DESC
  `;

  return { text: query, values };
}

// Helper: Parse parent key
function parseParentKey(parentKey: string, dimensions: string[]) {
  // Format: "campaign::Google Ads::adGroup::Brand Campaign"
  const parts = parentKey.split('::');
  const filters = [];

  for (let i = 0; i < parts.length; i += 2) {
    const dimensionName = parts[i];
    const value = parts[i + 1];
    filters.push({
      column: getDimensionColumn(dimensionName),
      value,
    });
  }

  return filters;
}
```

---

## Hierarchical Keys

**Format**: `dimension::value::dimension::value::...`

**Rules**:
1. Use `::` as separator (never `:` alone)
2. Dimension name first, then value
3. Order matches dimension array order (hierarchy depth)
4. URL-safe values (encode if needed)

**Examples**:
```typescript
// Depth 0 (root level): No key, fetch all
parentKey: undefined

// Depth 1: Filter by campaign
parentKey: "campaign::Google Ads"

// Depth 2: Filter by campaign + ad group
parentKey: "campaign::Google Ads::adGroup::Brand Campaign"

// Depth 3: Filter by campaign + ad group + keyword
parentKey: "campaign::Google Ads::adGroup::Brand Campaign::keyword::seo services"
```

**Building keys**:
```typescript
function buildChildKey(parentKey: string | undefined, dimension: string, value: string): string {
  if (!parentKey) {
    return `${dimension}::${value}`;
  }
  return `${parentKey}::${dimension}::${value}`;
}

// Usage
const row = {
  key: buildChildKey(parentKey, 'campaign', 'Google Ads'),
  attribute: 'Google Ads',
  depth: 0,
  hasChildren: true,
};
```

**Parsing keys**:
```typescript
function parseKey(key: string): Array<{ dimension: string; value: string }> {
  const parts = key.split('::');
  const parsed = [];

  for (let i = 0; i < parts.length; i += 2) {
    parsed.push({
      dimension: parts[i],
      value: parts[i + 1],
    });
  }

  return parsed;
}

// Usage
const parsed = parseKey("campaign::Google Ads::adGroup::Brand");
// Returns: [
//   { dimension: 'campaign', value: 'Google Ads' },
//   { dimension: 'adGroup', value: 'Brand' }
// ]
```

---

## Dimension Order = Hierarchy Depth

**CRITICAL**: Array position determines hierarchy level.

```typescript
// Dimensions order
dimensions: ['campaign', 'adGroup', 'keyword']

// Hierarchy depth mapping
[
  { attribute: 'Google Ads', depth: 0 },      // Campaign (dimensions[0])
  { attribute: 'Brand Campaign', depth: 1 },  // Ad Group (dimensions[1])
  { attribute: 'seo services', depth: 2 },    // Keyword (dimensions[2])
]

// If user reorders dimensions to: ['adGroup', 'campaign', 'keyword']
// Then hierarchy changes:
[
  { attribute: 'Brand Campaign', depth: 0 },  // Ad Group now at top
  { attribute: 'Google Ads', depth: 1 },      // Campaign now second
  { attribute: 'seo services', depth: 2 },    // Keyword still third
]
```

**hasChildren logic**:
```typescript
function determineHasChildren(depth: number, maxDepth: number): boolean {
  // maxDepth = dimensions.length - 1
  return depth < maxDepth;
}

// Example with dimensions: ['campaign', 'adGroup', 'keyword']
// maxDepth = 2
const campaign = { depth: 0, hasChildren: true };  // 0 < 2
const adGroup = { depth: 1, hasChildren: true };   // 1 < 2
const keyword = { depth: 2, hasChildren: false };  // 2 < 2 is false
```
