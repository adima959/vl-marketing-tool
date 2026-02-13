## Debugging: Table-vs-Modal Count Mismatch

When a table shows count X but the detail modal shows count Y, follow this exact sequence. DO NOT theorize about root causes until Step 4 is complete.

### Step 1: Accept the table count as ground truth until proven otherwise

The table count comes from the aggregate query (crmQueryBuilder.ts or marketingQueryBuilder.ts). The modal count comes from crmDetailModalQueryBuilder.ts. Your job is to find why the modal query returns fewer/more rows -- not to "fix" the table count.

State: "Table shows X, modal shows Y. Investigating why the modal query excludes/includes the delta of [X-Y] records."

### Step 2: Trace the exact modal query

1. Read the API route that serves the modal (e.g., /api/marketing-report/details/route.ts or /api/dashboard/details/route.ts)
2. Read the query builder method it calls in crmDetailModalQueryBuilder.ts
3. Identify which buildXxxQuery method runs for this metricId
4. Read crmMetrics.ts for the JOIN and WHERE constants used
5. Reconstruct the full SQL -- every JOIN, every WHERE clause

Show the reconstructed SQL before proceeding. Do not skip this.

### Step 3: Trace the exact table query

1. Read the aggregate query builder (crmQueryBuilder.ts for the metric in question)
2. Identify every JOIN and WHERE clause
3. Reconstruct the full SQL

Show both queries side-by-side and list every difference in: JOINs, WHERE clauses, column references (especially COALESCE paths vs direct column references), GROUP BY.

### Step 4: Identify the delta records

Write and run a script (npx tsx) that:
1. Runs the table's aggregate logic to confirm count = X
2. Runs the modal's query logic to confirm count = Y
3. Finds the specific records in the table result but NOT in the modal result (or vice versa)
4. Prints those delta records with all relevant columns (especially source, tracking IDs, product, country)

Do NOT propose any fix until you can name the exact records causing the discrepancy and explain why each one is included/excluded.

### Step 5: Root cause from the delta

Look at the delta records. The bug is always one of:
- A WHERE clause references a direct column (e.g., sr.source) instead of a COALESCE (e.g., COALESCE(sr.source, sr_sub.source))
- A JOIN is INNER in one query but LEFT in the other
- A filter is present in the modal query but absent in the aggregate query (or vice versa)
- The modal uses a different date field than the aggregate
- Tracking tuple resolution filters out records the aggregate includes

State the root cause with the exact column/clause difference and the affected records.

### Step 6: Fix and verify

1. Make the minimal change to align the modal query with the aggregate query
2. Re-run the script from Step 4 to confirm counts now match
3. Check that the fix doesn't break other metricId paths through the same builder method

### Key rules
- NEVER change COUNT(DISTINCT x) to COUNT(DISTINCT y) based on a theory. Verify counts with actual queries first.
- If the user provides screenshots, examine them immediately -- they tell you whether duplicates exist.
- The two-database architecture (PostgreSQL ads -> tracking tuples -> MariaDB CRM) means mismatches often live in the COALESCE/JOIN boundary between invoice-path and subscription-path columns.
- When in doubt, peel back: start with the simplest possible query (no filters), confirm the count, then add one WHERE clause at a time until the count drops.
