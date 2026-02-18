# On-Page CRM Matching Reference (for future reimplementation)

> **Status:** Removed in flat-query rebuild. This documents the old approach for re-implementing in a future phase.

## MariaDB Table

**Table:** `crm_subscription_enriched` (pre-joined, single-table scans)

**Columns used:**
- `date_create` — Subscription timestamp (UTC)
- `is_approved` — Boolean approval flag
- `ff_vid` — Visitor ID for exact matching
- `source_normalized` — Normalized UTM source
- `tracking_id_4` — Campaign ID
- `tracking_id_2` — Adset ID
- `tracking_id` — Ad ID
- `country_normalized` — Normalized country code

## Dimension Mapping (PG → CRM)

| PG Dimension | CRM groupBy | CRM filter | NULL sentinel | Normalization |
|---|---|---|---|---|
| `utmSource` | `source_normalized` | `source_normalized` | `''` | `'adwords'` → `'google'`; lowercase |
| `campaign` | `tracking_id_4` | `tracking_id_4` | `''` | None |
| `adset` | `tracking_id_2` | `tracking_id_2` | `''` | None |
| `ad` | `tracking_id` | `tracking_id` | `''` | None |
| `date` | `DATE_FORMAT(date_create, '%Y-%m-%d')` | `DATE(date_create)` | N/A | None |
| `countryCode` | `country_normalized` | `country_normalized` | `'Unknown'` | uppercase |

## 3-Tier Matching Strategy

### Strategy A: Direct CRM Match (1 query)
**When:** Current dimension IS in the CRM map AND no non-matchable parent filters.
```sql
SELECT <crm_column> AS dimension_value, COUNT(*) AS trials, SUM(is_approved) AS approved
FROM crm_subscription_enriched
WHERE date_create BETWEEN ? AND ?
GROUP BY <crm_column>
```
Result is 1:1 lookup — no proportional distribution needed.

### Strategy B: Tracking Combo Match (proportional)
**When:** Current dimension has no CRM equivalent (e.g., `urlPath`, `deviceType`).

1. Fetch CRM grouped by `(source, campaign_id, adset_id, ad_id)`
2. Fetch PG tracking combos: `(dimension_value, source, campaign_id, adset_id, ad_id, unique_visitors)`
3. Build key: `source::campaign_id::adset_id::ad_id`
4. Distribute proportionally: `proportion = row.unique_visitors / totalComboVisitors`
5. `trials_for_dim += crm.trials * proportion`

### Strategy C: Visitor ID Match (even distribution, highest priority)
**When:** Same as B, but takes priority over tracking combo when ff_vid exists.

1. Fetch CRM grouped by `ff_vid`
2. Fetch PG: `(dimension_value, ff_visitor_id)` pairs
3. Count how many dimension values each visitor appears in
4. Distribute evenly: `trials_for_dim += crm.trials / dimCount`

## Priority Order (per dimension value)
1. ff_vid match (exact) — if found with trials > 0, use it
2. Tracking combo match (proportional fallback)
3. Zero (no match)

## Edge Cases
- **Classification dims** (`classifiedProduct`, `classifiedCountry`): Skip CRM entirely → 0
- **Non-matchable parent filter** (e.g., `deviceType=phone`): Forces Strategies B+C even for matchable child dims
- **Tracking field exclusion**: Exclude fields that ARE the current dimension from combo key
- **NULL normalization**: CRM null → `''`, PG null → `'Unknown'`, both lowercase for lookup
- **`utmSource='adwords'`** (PG) → maps to `'google'` (CRM)

## Metrics Computed
```
crmTrials = trials
crmApproved = approved
crmConvRate = trials / uniqueVisitors
crmApprovalRate = approved / trials
```

## Parallel Query Execution
All queries run via `Promise.all` (1–6 queries per request depending on strategy).
