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

---

## Variant B: Cross-Database Dimension Mismatch (Marketing Report vs Dashboard/CRM)

When the marketing report shows a different count than the dashboard for the **same dimension + filters**, the bug is in how PG and CRM data are joined — not in either query alone.

### Symptom checklist
- Marketing report: Country X → Network Y shows N customers
- Dashboard: same Country X → Network Y shows M customers (M != N)
- Or: sum of children > parent (e.g., DK=54 but Google Ads=53 + Facebook=19 = 72)

If either symptom matches, follow this variant instead of Steps 1-6 above.

### B1: Establish ground truth in each database independently

Write a script (`npx tsx`) that queries:
1. **CRM (MariaDB):** Direct count with the dimension as a WHERE filter (e.g., `LOWER(c.country) LIKE '%denmark%'` AND `LOWER(sr.source) IN ('adwords','google')`)
2. **PG (PostgreSQL):** What campaigns/ads does PG classify under this dimension value?

Compare the CRM ground truth to both the dashboard and marketing report numbers. The dashboard uses CRM directly, so it should match the CRM count. The marketing report joins PG→CRM, so mismatches indicate a join problem.

### B2: Cross-reference dimension values across databases

**This is the critical step.** Check how each database represents the dimension:

| Dimension | PostgreSQL | MariaDB CRM |
|-----------|-----------|-------------|
| Country | ISO codes: `DK`, `SE`, `NO` | Full names: `denmark`, `sweden` (inconsistent casing) |
| Network | `Google Ads`, `Facebook` | `adwords`, `google`, `facebook`, `meta` |
| Product | `app_products.name` | `product.product_name` |

If PG uses `'DK'` and CRM uses `'denmark'`, the join must map between them. Check `COUNTRY_CODE_TO_CRM` in `lib/server/crmMetrics.ts` and `SOURCE_MAPPING` in the same file.

### B3: Simulate the application's matching logic

Reproduce what `marketingQueryBuilder.ts` does:
1. Get the PG ads rows for this dimension (campaign_ids, adset_ids, ad_ids, networks)
2. Get the CRM data (subscriptions, OTS, trials)
3. Run the matching function (source-level, source+country, or tracking-level)
4. Compare the result to what the report shows

The bug is almost always: **CRM data is not filtered by the same dimension that PG uses to group rows.** For example, PG groups ads by country_code='DK', but CRM returns ALL customers matching those tracking IDs regardless of country.

### B4: Check parent→child filter propagation

When drilling down (e.g., Country → Network), the parent filter must propagate to CRM matching:
- PG query: `WHERE cc.country_code = 'DK'` (filters ads correctly)
- CRM matching: must ALSO filter by country, not just by source/tracking

**Red flag:** If children sum > parent, the child queries are missing the parent's dimension filter on the CRM side. Check `countryParentFilter` detection in `marketingQueryBuilder.ts`.

### B5: Verify the matching strategy routing

The marketing report uses 3 CRM matching strategies (see `marketingQueryBuilder.ts`):

| Strategy | When used | CRM function |
|----------|-----------|-------------|
| Source-only | `network` dimension (no country parent) | `matchAdsToCrmBySource` |
| Source+Country | `classifiedCountry` dim, OR any non-tracking dim with country parent filter | `matchAdsToCrmBySourceCountry` |
| Tracking-level | `campaign`, `adset`, `ad` dimensions | `matchAdsToCrm` + Unknown row |

Verify the current dimension routes to the correct strategy. A wrong route causes over- or under-counting.

### B6: Fix and verify

1. If the mapping is missing: add to `COUNTRY_CODE_TO_CRM` or `SOURCE_MAPPING` in `crmMetrics.ts`
2. If CRM isn't filtered by a dimension: add the dimension to CRM GROUP BY and matching index
3. If parent filter doesn't propagate: add detection in `marketingQueryBuilder.ts` routing logic
4. Re-run the script from B1 and confirm marketing report now matches dashboard
