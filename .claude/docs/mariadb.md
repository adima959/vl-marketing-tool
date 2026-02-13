# MariaDB Database Guide

CRM subscription and customer data.

**Library:** `mysql2/promise`
**Connection:** Pool (10 connections, 30s timeout)
**Placeholders:** `?` (not `$1` like PostgreSQL)

---

## Database Schema

### Tables Overview

| Table | Purpose | Primary Relationships |
|-------|---------|----------------------|
| **subscription** | Main subscription records | → customer, → product, → source |
| **invoice** | Trials, upsells, refunds | → subscription, → customer, → source |
| **customer** | Customer information | ← subscription, ← invoice |
| **product** | Product catalog | ← subscription, ← invoice_product |
| **source** | Traffic source | ← subscription, ← invoice |
| **invoice_product** | Invoice-product junction | → invoice, → product |
| **invoice_proccessed** | Processed/paid invoices | → invoice |
| **cancel_reason** | Cancel reason catalog | ← subscription_cancel_reason |
| **subscription_cancel_reason** | Subscription-cancel junction | → subscription, → cancel_reason |

### Entity Relationship Diagram

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

---

### subscription

**Status values:** 1=active, 4=cancel_soft, 5=cancel_forever
**Customer classification:** New = `DATE(c.date_registered) = DATE(s.date_create)`, Existing = `<`

```sql
CREATE TABLE `subscription` (
  `id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `source_id` int(11) DEFAULT NULL,
  `tracking_id` varchar(300) DEFAULT NULL,
  `tracking_id_2` varchar(300) DEFAULT NULL,
  `tracking_id_3` varchar(300) DEFAULT NULL,
  `tracking_id_4` varchar(300) DEFAULT NULL,
  `tracking_id_5` varchar(300) DEFAULT NULL,
  `trial_price` decimal(8,2) NOT NULL,
  `rebill_price` decimal(8,2) NOT NULL,
  `next_rebill_date` date DEFAULT NULL,
  `last_rebill_date` datetime DEFAULT NULL,
  `trial_quantity` int(11) NOT NULL,
  `rebill_quantity` int(11) NOT NULL,
  `rebill_after` int(11) NOT NULL,
  `trial_shipping_handling` decimal(10,2) NOT NULL,
  `rebills_left` int(11) DEFAULT NULL,
  `rebill_shipping_handling` decimal(10,2) NOT NULL,
  `vat` decimal(10,2) DEFAULT NULL,
  `date_create` datetime NOT NULL,
  `date_cancel` datetime DEFAULT NULL,
  `date_cancel_soft` date DEFAULT NULL,
  `uniq_id` text DEFAULT NULL,
  `has_upsell` tinyint(1) DEFAULT 0,
  `upsell_bought` tinyint(1) NOT NULL DEFAULT 0,
  `status` int(11) NOT NULL,
  `last_status_change` datetime DEFAULT NULL,
  `cancellation_trigger` char(255) DEFAULT 'cancellation',
  `canceled_via` int(11) DEFAULT NULL,
  `canceled_reason` int(11) DEFAULT NULL,
  `canceled_reason_about` text DEFAULT NULL,
  `last_cancel_date` date DEFAULT NULL,
  `site_name` varchar(600) DEFAULT NULL,
  `date_frozen` datetime DEFAULT NULL,
  `date_paid_last` datetime DEFAULT NULL,
  `deleted` tinyint(1) NOT NULL DEFAULT 0,
  `affiliate_id` int(11) DEFAULT NULL,
  `customer_lead_sync` tinyint(1) NOT NULL DEFAULT 0,
  `tag` text DEFAULT NULL,
  `terms_content` text DEFAULT NULL,
  `is_credit_card` tinyint(1) NOT NULL DEFAULT 0,
  `public_id` int(11) NOT NULL,
  `identity_hash` char(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `customer_id` (`customer_id`),
  KEY `product_id` (`product_id`),
  KEY `date_create_idx` (`date_create`),
  KEY `status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8
```

### invoice

**Types:** 1=trial, 2=rebill, 3=upsell (OTS, linked via `tag` containing `parent-sub-id=X`), 4=refund (linked via `parent_id`)
**Dates:** `order_date` = when placed. `invoice_date` = when finalized (CRM uses this for Buy Rate filtering). `on_hold_date` = when held (NULL = not on hold).
**Approval:** `is_marked`: 1=approved, 0=pending/rejected, NULL=unprocessed. `on_hold_date IS NOT NULL` = on hold (independent of `is_marked`).
**Source:** `source_id` only set for trials/OTS, NULL for rebills.

```sql
CREATE TABLE `invoice` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `parent_id` int(11) DEFAULT 0,
  `customer_id` int(11) NOT NULL,
  `subscription_id` int(11) DEFAULT NULL,
  `invoice_date` datetime DEFAULT NULL,
  `on_hold_date` datetime DEFAULT NULL,
  `order_date` datetime NOT NULL,
  `due_date` datetime NOT NULL,
  `type` tinyint(4) NOT NULL,
  `coupon_id` int(11) DEFAULT NULL,
  `shipping_handling` decimal(10,2) NOT NULL DEFAULT 0.00,
  `shipping_handling_vat` decimal(10,2) DEFAULT 0.00,
  `total_vat` decimal(10,2) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `total_exc_vat` decimal(10,2) NOT NULL,
  `total_discount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `note` text DEFAULT NULL,
  `status` tinyint(4) NOT NULL,
  `invoice_key` varchar(600) DEFAULT NULL,
  `site_name` varchar(600) DEFAULT NULL,
  `rebill_count` int(11) DEFAULT NULL,
  `rebill_count_no_refund` int(11) DEFAULT NULL,
  `soft_cancel` tinyint(1) DEFAULT 0,
  `deleted` tinyint(1) NOT NULL DEFAULT 0,
  `send_email` tinyint(1) DEFAULT 0,
  `last_rebill_day_diff` int(11) DEFAULT 0,
  `step` varchar(120) DEFAULT NULL,
  `date_email_sent` datetime DEFAULT NULL,
  `date_sms_sent` datetime DEFAULT NULL,
  `date_scam_check` datetime DEFAULT NULL,
  `is_marked` tinyint(3) DEFAULT NULL,
  `delivery_date_estimate` varchar(300) DEFAULT NULL,
  `delivery_type` varchar(16) DEFAULT NULL,
  `credit_card_payment_date` datetime DEFAULT NULL,
  `source_id` int(11) DEFAULT NULL,
  `tracking_id` varchar(300) DEFAULT NULL,
  `tracking_id_2` varchar(300) DEFAULT NULL,
  `tracking_id_3` varchar(300) DEFAULT NULL,
  `tracking_id_4` varchar(300) DEFAULT NULL,
  `tracking_id_5` varchar(300) DEFAULT NULL,
  `tag` text DEFAULT NULL,
  `club` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `customer_id` (`customer_id`),
  KEY `subscription_id` (`subscription_id`),
  KEY `idx_order_date` (`order_date`),
  KEY `idx_deleted_type` (`deleted`,`type`)
) ENGINE=InnoDB AUTO_INCREMENT=1617556 DEFAULT CHARSET=utf8
```

### customer

**Country field:** Full names with inconsistent casing (`'Denmark'`, `'denmark'`), NOT ISO codes. Always `LOWER(c.country)`. See [Cross-Database Value Mappings](#cross-database-value-mappings-crm--postgresql).

```sql
CREATE TABLE `customer` (
  `id` int(11) NOT NULL,
  `email` varchar(120) DEFAULT NULL,
  `password` text DEFAULT NULL,
  `first_name` varchar(120) NOT NULL,
  `last_name` varchar(120) NOT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `address` varchar(320) NOT NULL,
  `postal_code` varchar(120) NOT NULL,
  `place` varchar(150) NOT NULL,
  `birthday` date DEFAULT NULL,
  `phone_number` varchar(16) NOT NULL,
  `sex` int(11) DEFAULT NULL,
  `date_registered` datetime NOT NULL,
  `source_id` int(11) DEFAULT NULL,
  `tracking_id` varchar(120) DEFAULT NULL,
  `tracking_id_2` varchar(300) DEFAULT NULL,
  `tracking_id_3` varchar(300) DEFAULT NULL,
  `tracking_id_4` varchar(300) DEFAULT NULL,
  `tracking_id_5` varchar(300) DEFAULT NULL,
  `status` int(11) NOT NULL,
  `deleted` tinyint(1) NOT NULL DEFAULT 0,
  `country` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `date_registered` (`date_registered`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8
```

### product

```sql
CREATE TABLE `product` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sku` varchar(16) NOT NULL,
  `product_name` varchar(220) NOT NULL,
  `product_name_invoice` varchar(220) NOT NULL,
  `trial_price` decimal(10,2) NOT NULL,
  `rebill_price` decimal(10,2) NOT NULL,
  `trial_quantity` int(11) NOT NULL,
  `rebill_quantity` int(11) NOT NULL,
  `type` int(11) NOT NULL,
  `status` tinyint(4) NOT NULL,
  `deleted` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_product_name` (`product_name`)
) ENGINE=InnoDB AUTO_INCREMENT=4459 DEFAULT CHARSET=utf8
```

### source

```sql
CREATE TABLE `source` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `source` varchar(600) NOT NULL,
  `deleted` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=670 DEFAULT CHARSET=utf8
```

### invoice_product

```sql
CREATE TABLE `invoice_product` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_id` int(11) NOT NULL,
  `product_id` int(11) DEFAULT NULL,
  `product_sku` varchar(120) DEFAULT NULL,
  `product_name` varchar(120) DEFAULT NULL,
  `quantity` int(11) NOT NULL,
  `vat` decimal(10,2) NOT NULL,
  `summary` decimal(10,2) NOT NULL,
  `coupon_id` int(11) DEFAULT NULL,
  `is_alt` tinyint(1) NOT NULL DEFAULT 0,
  `upsell` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  KEY `product_id` (`product_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1648867 DEFAULT CHARSET=utf8
```

### invoice_proccessed

**CRITICAL:** CRM UI displays `invoice_proccessed.id` as "Invoice ID", NOT `invoice.id`. Join: `invoice_proccessed.invoice_id → invoice.id`.
**`date_bought IS NOT NULL`** = trial converted to paid. Only invoices in this table are "processed".

```sql
CREATE TABLE `invoice_proccessed` (
  `id` int(11) NOT NULL,
  `invoice_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `ocr` varchar(120) DEFAULT NULL,
  `last_cancel_date` date DEFAULT NULL,
  `date_paid` datetime DEFAULT NULL,
  `total_paid` decimal(10,2) DEFAULT NULL,
  `status` tinyint(4) NOT NULL,
  `date_bought` date DEFAULT NULL,
  `date_rebuy` date DEFAULT NULL,
  `public_invoice_id` int(11),
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`,`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8
```

### cancel_reason

```sql
CREATE TABLE `cancel_reason` (
  `primk` int(11) NOT NULL AUTO_INCREMENT,
  `id` int(11) NOT NULL,
  `caption` varchar(300) NOT NULL,
  PRIMARY KEY (`primk`),
  KEY `idx_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=89 DEFAULT CHARSET=latin1
```

### subscription_cancel_reason

```sql
CREATE TABLE `subscription_cancel_reason` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subscription_id` int(11) NOT NULL,
  `cancel_reason_id` int(11) NOT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `subscription_id` (`subscription_id`),
  KEY `subscription_cancel_reason_cancel_reason_id` (`cancel_reason_id`)
) ENGINE=InnoDB AUTO_INCREMENT=680014 DEFAULT CHARSET=latin1
```

### Pay Rate & Buy Rate (Matching CRM)

**Rules:** Use `invoice_date` (not `order_date`). INNER JOIN `invoice_proccessed`. Case-insensitive country: `LOWER(c.country)`.
**Pay Rate:** `ipr.date_paid IS NOT NULL`. **Buy Rate:** `ipr.date_bought IS NOT NULL`.

```sql
SELECT
  COUNT(DISTINCT ipr.id) as total,
  SUM(CASE WHEN i.type = 1 THEN 1 ELSE 0 END) as trials,
  SUM(CASE WHEN i.type = 2 THEN 1 ELSE 0 END) as rebills,
  SUM(CASE WHEN i.type = 4 THEN 1 ELSE 0 END) as refunds
FROM invoice_proccessed ipr
INNER JOIN invoice i ON i.id = ipr.invoice_id
JOIN subscription s ON s.id = i.subscription_id
JOIN customer c ON c.id = s.customer_id
JOIN source sr ON sr.id = s.source_id
WHERE LOWER(c.country) = 'sweden'
  AND sr.source = 'Adwords'
  AND i.type != 4  -- Exclude refunds
  AND DATE(i.invoice_date) BETWEEN '2025-12-01' AND '2025-12-14'
```

**Common mistakes:** `order_date` instead of `invoice_date`. LEFT JOIN to `invoice_proccessed`. Case-sensitive country. Counting `invoice.id` instead of `invoice_proccessed.id`.

---

## UTM Parameter Mapping

| UTM Parameter | CRM Field | Description |
|---------------|-----------|-------------|
| `utm_source` | `source.source` | Traffic source ("Facebook", "Adwords") |
| `utm_medium` | `tracking_id` / `tracking_id_1` | Ad ID / creative ID |
| `utm_content` | `tracking_id_2` | Adset ID / ad group ID |
| `utm_term` | `tracking_id_3` | Keywords (Google Ads) |
| `utm_campaign` | `tracking_id_4` | Campaign ID |
| (click ID) | `tracking_id_5` | fbclid, gclid |

### Tracking ID Field Naming Gotcha

| Table | First tracking field | Fields 2-5 |
|-------|---------------------|-------------|
| `subscription` | `tracking_id` (no `_1`) | `tracking_id_2` through `_5` |
| `invoice` | `tracking_id_1` (explicit) | `tracking_id_2` through `_5` |
| `customer` | `tracking_id` (no `_1`) | `tracking_id_2` through `_5` |

`subscription.tracking_id` = `invoice.tracking_id_1` = `customer.tracking_id` — same data, different column names.

### Platform Templates

**Facebook:** `source='Facebook'`, `tracking_id`={{ad.id}}, `tracking_id_2`={{adset.id}}, `tracking_id_4`={{campaign.id}}, `tracking_id_5`=fbclid
**Google Ads:** `source='Adwords'`, `tracking_id`={creative}, `tracking_id_2`={adgroupid}, `tracking_id_3`={keyword}, `tracking_id_4`={campaignid}, `tracking_id_5`=gclid

### Important Notes

**Source names are inconsistent** — Google may be "Adwords" or "Google". Always: `LOWER(sr.source) IN ('adwords', 'google')`.

**Clean tracking IDs before use** — may contain `''`, `'null'`, funnel IDs, or short invalid values:
```sql
CASE
  WHEN tracking_id_5 = 'null' THEN NULL
  WHEN tracking_id_5 = '' THEN NULL
  WHEN tracking_id_5 LIKE '%funnel%' THEN NULL
  WHEN LENGTH(tracking_id_5) < 20 THEN NULL
  ELSE tracking_id_5
END as clean_click_id
```

**Use subscription tracking** for attribution (most accurate across tables).

**Soft delete:** All main tables have `deleted` column (0=active, 1=deleted). Always `WHERE deleted = 0` in production.

---

## Cross-Database Value Mappings (CRM ↔ PostgreSQL)

CRM and PG represent the same dimensions differently. When joining data across databases, use the mapping constants in `lib/server/crmMetrics.ts`.

| Dimension | PostgreSQL | MariaDB CRM | Mapping constant |
|-----------|-----------|-------------|------------------|
| Country | ISO codes: `DK`, `SE`, `NO`, `FI` | Full names (inconsistent casing): `denmark`, `Denmark`, `sweden` | `COUNTRY_CODE_TO_CRM` |
| Network/Source | `Google Ads`, `Facebook` | `adwords`, `google`, `facebook`, `meta`, `fb` | `SOURCE_MAPPING` |

**Always use `LOWER(c.country)`** when matching CRM countries — casing is inconsistent.

**When adding a new country:** update `COUNTRY_CODE_TO_CRM` in `lib/server/crmMetrics.ts` AND verify the CRM stores the expected full name by querying: `SELECT DISTINCT country FROM customer WHERE LOWER(country) LIKE '%<name>%'`.

---

## Connection & Queries

**File**: `lib/server/mariadb.ts` — read source for pool config, `executeMariaDBQuery()`, `testMariaDBConnection()`.
**Placeholders**: `?` (NOT `$1`). **Env vars**: `MARIADB_HOST`, `MARIADB_PORT`, `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_DATABASE`.
For query builders, read: `lib/server/crmQueryBuilder.ts`, `lib/server/crmDetailModalQueryBuilder.ts`.
