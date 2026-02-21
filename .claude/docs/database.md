# Database Reference

## Overview

| Database | Purpose | Library | Connection | Placeholders |
|----------|---------|---------|------------|-------------|
| **PostgreSQL (Neon)** | App data, tracker analytics | `@neondatabase/serverless` | `lib/server/db.ts` | `$1, $2, $3` |
| **MariaDB** | CRM subscriptions & customers | `mysql2/promise` | `lib/server/mariadb.ts` | `?` |

**CRITICAL**: Placeholder rules + neondb-only rule enforced in CLAUDE.md. MariaDB env vars: `MARIADB_HOST`, `MARIADB_PORT`, `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_DATABASE`.

**MariaDB gotcha**: Use `pool.query()` for simple queries, `pool.execute()` for parameterized — avoids "prepared statement needs to be re-prepared" errors with views.

---

## MariaDB CRM Schema

### Entity Relationships

```
customer (c)
  ├── subscription (s) [1:M via customer_id]
  │   ├── invoice (i) [1:M via subscription_id]
  │   │   ├── invoice_proccessed (ipr) [1:1 via invoice_id]
  │   │   │   └── invoice (refund) [1:M via parent_id]
  │   │   ├── invoice_product (ip) [1:M via invoice_id]
  │   │   │   └── product (p) [M:1 via product_id]
  │   │   └── source (sr) [M:1 via source_id]
  │   ├── product (p) [M:1 via product_id]
  │   ├── source (sr) [M:1 via source_id]
  │   └── subscription_cancel_reason (scr) [1:M via subscription_id]
  │       └── cancel_reason (cr) [M:1 via cancel_reason_id]
  └── invoice (upsell) [1:M via customer_id + tag LIKE '%parent-sub-id=%']
```

### Key Tables

**subscription** — Main subscription records
- Key columns: `id`, `customer_id`, `product_id`, `source_id`, `tracking_id`, `tracking_id_2..5`, `date_create` (datetime), `date_cancel`, `status` (int), `deleted`, `has_upsell`, `upsell_bought`, `tag` (text)
- **Status**: 1=active, 4=cancel_soft, 5=cancel_forever
- **New customer**: `DATE(c.date_registered) = DATE(s.date_create)` — Existing: `<`

**invoice** — Trials, rebills, upsells, refunds
- Key columns: `id`, `parent_id`, `customer_id`, `subscription_id`, `invoice_date` (datetime), `order_date`, `on_hold_date`, `type` (tinyint), `is_marked` (tinyint), `source_id`, `tracking_id_1` (NOTE: explicit `_1`, unlike subscription!), `tracking_id_2..5`, `total`, `deleted`, `tag`
- **Type**: 1=trial, 2=rebill, 3=upsell/OTS (linked via `tag` containing `parent-sub-id=X`), 4=refund (linked via `parent_id`)
- **Dates**: `order_date` = placed, `invoice_date` = finalized (CRM uses this for reporting)
- **Approval**: `is_marked`: 1=approved, 0=pending, NULL=unprocessed. `on_hold_date IS NOT NULL` = on hold

**customer** — Customer info
- Key columns: `id`, `first_name`, `last_name`, `email`, `country` (varchar — full names, inconsistent casing!), `date_registered`, `source_id`, `tracking_id`, `tracking_id_2..5`, `deleted`
- **ALWAYS** use `LOWER(c.country)` — casing is inconsistent ("Denmark" vs "denmark")

**invoice_proccessed** — Processed/paid invoices
- Key columns: `id`, `invoice_id`, `customer_id`, `date_paid`, `date_bought`, `total_paid`
- **CRITICAL**: CRM UI displays `ipr.id` as "Invoice ID", NOT `invoice.id`
- `date_bought IS NOT NULL` = trial converted to paid

**product** — `id`, `sku`, `product_name`, `type`, `status`, `deleted`

**source** — `id`, `source` (varchar — traffic source name), `deleted`

**invoice_product** — Junction: `invoice_id` → `product_id`, with `quantity`, `summary` (amount), `upsell` flag

**cancel_reason** — `primk` (PK), `id`, `caption`. Joined via `subscription_cancel_reason` (`subscription_id`, `cancel_reason_id`)

---

## CRM Business Rules

- **Soft delete**: All main tables have `deleted` column — always `WHERE deleted = 0`
- **Pay Rate**: INNER JOIN `invoice_proccessed`, filter `ipr.date_paid IS NOT NULL`
- **Buy Rate**: INNER JOIN `invoice_proccessed`, filter `ipr.date_bought IS NOT NULL`
- **Pay/Buy queries**: Use `invoice_date` (NOT `order_date`), `LOWER(c.country)`, count `ipr.id` (NOT `invoice.id`)
- **Source names are inconsistent**: Google may be "Adwords" or "Google" — use `LOWER(sr.source) IN ('adwords', 'google')`
- **Use subscription tracking** for attribution (most accurate across tables)
- **Shared CRM filters**: `lib/server/crmFilters.ts` — reusable WHERE clauses (notDeleted, notUpsellTagged, isMarked, hasTrackingIds)

---

## UTM Parameter Mapping

| UTM Parameter | CRM Field | Notes |
|---------------|-----------|-------|
| `utm_source` | `source.source` | Traffic source ("Facebook", "Adwords") |
| `utm_medium` | `tracking_id` / `tracking_id_1` | Ad ID / creative ID |
| `utm_content` | `tracking_id_2` | Adset ID / ad group ID |
| `utm_term` | `tracking_id_3` | Keywords (Google Ads) |
| `utm_campaign` | `tracking_id_4` | Campaign ID |
| (click ID) | `tracking_id_5` | fbclid, gclid |

**Tracking ID naming gotcha**:

| Table | First tracking field | Fields 2-5 |
|-------|---------------------|-------------|
| `subscription` | `tracking_id` (no `_1`) | `tracking_id_2` through `_5` |
| `invoice` | `tracking_id_1` (explicit) | `tracking_id_2` through `_5` |
| `customer` | `tracking_id` (no `_1`) | `tracking_id_2` through `_5` |

---

## Cross-Database Value Mappings

| Dimension | PostgreSQL | MariaDB CRM |
|-----------|-----------|-------------|
| Country | ISO codes: `DK`, `SE`, `NO`, `FI` | Full names (inconsistent casing): `denmark`, `Denmark` |
| Network/Source | `Google Ads`, `Facebook` | `adwords`, `google`, `facebook`, `meta`, `fb` |

When adding a new country: verify CRM stores expected name via `SELECT DISTINCT country FROM customer WHERE LOWER(country) LIKE '%<name>%'`.

---

## PostgreSQL App Notes

**Tracker tables** (on-page analytics): `tracker_sessions`, `tracker_page_views`, `tracker_events`, `tracker_raw_heartbeats`, `tracker_visitors`. All queries go through `lib/server/trackerQueryBuilder.ts` — single source of truth for JOINs, event aggregation, dimension maps. Queries raw tables directly (no views).

**Entity history** (`app_entity_history`): `entity_id` and `changed_by` are UUID. Entity tables (`app_products`, `app_angles`) use UUID `id`. To extract UUID from JSONB: `TRIM(BOTH '"' FROM h.old_value::text)` then compare with `id::text`. PostgreSQL won't implicitly cast UUID ↔ text.

**Neon-specific**: Connection pooling via Neon proxy. Use `@neondatabase/serverless` for edge. Cold starts possible (Neon scales to zero). Use Neon branches for schema testing.

---

## Query Builder Index

| Builder | Database | Purpose | Source |
|---------|----------|---------|--------|
| `crmQueryBuilder` | MariaDB | CRM sales (3 parallel queries: subs, OTS, upsells) | `lib/server/crmQueryBuilder.ts` |
| `trackerQueryBuilder` | PostgreSQL | On-page analytics (sessions, page views, events) | `lib/server/trackerQueryBuilder.ts` |
| `marketingQueryBuilder` | PostgreSQL | Ad spend, clicks, conversions by dimensions | `lib/server/marketingQueryBuilder.ts` |
| `dbErrorClassifier` | Both | Config-driven error classification | `lib/server/dbErrorClassifier.ts` |
