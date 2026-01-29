# MariaDB Database Guide

Comprehensive guide for working with the CRM MariaDB database, including schema reference, query patterns, and real-world use cases.

**Database:** CRM subscription and customer data
**Library:** `mysql2/promise`
**Connection:** Connection pooling (10 concurrent connections, 30-second timeout)
**Placeholders:** `?` (not `$1` like PostgreSQL)

---

## Table of Contents

1. [Database Schema](#database-schema)
2. [UTM Parameter Mapping & Attribution](#utm-parameter-mapping--attribution)
3. [Connection & Configuration](#connection--configuration)
4. [Query Patterns Library](#query-patterns-library)
5. [Common Use Cases](#common-use-cases)
6. [Advanced Patterns](#advanced-patterns)
7. [Performance & Optimization](#performance--optimization)
8. [Error Handling](#error-handling)
9. [TypeScript Integration](#typescript-integration)
10. [Testing & Verification](#testing--verification)
11. [Data Quality & Cleanup](#data-quality--cleanup)

---

## Database Schema

### Tables Overview

| Table | Purpose | Key Columns | Primary Relationships |
|-------|---------|-------------|----------------------|
| **subscription** | Main subscription records | id, customer_id, product_id, source_id, date_create, status | → customer, → product, → source |
| **invoice** | Trials, upsells, refunds | id, customer_id, subscription_id, type, is_marked, deleted, tag | → subscription, → customer, → source |
| **customer** | Customer information | id, first_name, last_name, email, date_registered, country | ← subscription, ← invoice |
| **product** | Product catalog | id, product_name, sku, trial_price, rebill_price | ← subscription, ← invoice_product |
| **source** | Traffic source | id, source | ← subscription, ← invoice |
| **invoice_product** | Invoice-product junction | invoice_id, product_id, product_sku, product_name | → invoice, → product |
| **invoice_proccessed** | Processed/paid invoices | id, invoice_id, date_paid, date_bought | → invoice |
| **cancel_reason** | Cancel reason catalog | id, caption | ← subscription_cancel_reason |
| **subscription_cancel_reason** | Subscription-cancel junction | subscription_id, cancel_reason_id | → subscription, → cancel_reason |

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

### subscription Table

**Purpose:** Core subscription records with trial, rebill, and cancellation information.

**Key Columns:**
- `id` (int, PK) - Unique subscription identifier
- `customer_id` (int, FK → customer.id) - Customer who owns this subscription
- `product_id` (int, FK → product.id) - Subscribed product
- `source_id` (int, FK → source.id) - Traffic source
- `tracking_id`, `tracking_id_2`, `tracking_id_3`, `tracking_id_4`, `tracking_id_5` (varchar 300) - Tracking identifiers
- `trial_price`, `rebill_price` (decimal 8,2) - Pricing
- `date_create` (datetime) - Subscription creation date
- `date_cancel` (datetime) - Hard cancel date
- `date_cancel_soft` (date) - Soft cancel date
- `status` (int) - Subscription status (1=active, 4=cancel_soft, 5=cancel_forever)
- `has_upsell` (tinyint 1) - Whether subscription has upsells
- `upsell_bought` (tinyint 1) - Whether upsell was purchased
- `deleted` (tinyint 1) - Soft delete flag (0=active, 1=deleted)
- `tag` (text) - Metadata tags

**Important Indexes:**
- PRIMARY KEY (`id`)
- KEY `customer_id` (`customer_id`)
- KEY `date_create_idx` (`date_create`)
- KEY `status` (`status`, `deleted`)

**Schema:**
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

---

### invoice Table

**Purpose:** Invoices for trials (type=1), upsells (type=3), and refunds (type=4).

**Key Columns:**
- `id` (int, PK) - Unique invoice identifier
- `parent_id` (int, FK → invoice_proccessed.id) - Parent invoice (for refunds)
- `customer_id` (int, FK → customer.id) - Invoice customer
- `subscription_id` (int, FK → subscription.id) - Related subscription (nullable for upsells)
- `order_date` (datetime) - Order creation date
- `type` (tinyint) - Invoice type: **1=trial**, **3=upsell (OTS)**, **4=refund**
- `total` (decimal 10,2) - Total invoice amount
- `is_marked` (tinyint) - Approval status: **1=approved**, **0=pending/rejected**
- `deleted` (tinyint 1) - Soft delete flag (0=active, 1=deleted)
- `source_id` (int, FK → source.id) - Traffic source
- `tracking_id`, `tracking_id_2`, `tracking_id_3`, `tracking_id_4`, `tracking_id_5` (varchar 300) - Tracking identifiers
- `tag` (text) - Metadata tags (upsells contain `parent-sub-id=X`)

**Invoice Types:**
- **Type 1 (Trial):** Initial subscription trial invoice
- **Type 3 (OTS - One Time Sale):** Upsell invoice (linked via `tag` field)
- **Type 4 (Refund):** Refund invoice (linked via `parent_id`)

**Approval States:**
- `is_marked = 1` → Approved/validated
- `is_marked = 0` → Pending or rejected

**Important Indexes:**
- PRIMARY KEY (`id`)
- KEY `customer_id` (`customer_id`)
- KEY `subscription_id` (`subscription_id`)
- KEY `idx_order_date` (`order_date`)
- KEY `idx_deleted_type` (`deleted`, `type`)

**Schema:**
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

---

### customer Table

**Purpose:** Customer information including contact details, demographics, and registration data.

**Key Columns:**
- `id` (int, PK) - Unique customer identifier
- `email` (varchar 120) - Customer email
- `first_name`, `last_name` (varchar 120) - Customer name
- `address`, `postal_code`, `place` (varchar) - Address information
- `country` (varchar 300) - Country name
- `birthday` (date) - Date of birth
- `phone_number` (varchar 16) - Phone number
- `sex` (int) - Gender
- `date_registered` (datetime) - Customer registration date
- `source_id` (int, FK → source.id) - Traffic source
- `tracking_id`, `tracking_id_2`, `tracking_id_3`, `tracking_id_4`, `tracking_id_5` (varchar) - Tracking identifiers
- `status` (int) - Customer status
- `deleted` (tinyint 1) - Soft delete flag

**Important for Customer Classification:**
- New customer: `DATE(c.date_registered) = DATE(s.date_create)`
- Existing customer: `DATE(c.date_registered) < DATE(s.date_create)`

**Schema:**
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
  -- ... additional validation columns
  `deleted` tinyint(1) NOT NULL DEFAULT 0,
  `country` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `date_registered` (`date_registered`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8
```

---

### product Table

**Purpose:** Product catalog with pricing, SKU, and configuration.

**Key Columns:**
- `id` (int, PK) - Unique product identifier
- `sku` (varchar 16) - Stock keeping unit
- `product_name` (varchar 220) - Product name
- `trial_price`, `rebill_price` (decimal 10,2) - Pricing
- `trial_length`, `rebill_after` (int) - Subscription timing
- `type` (int) - Product type
- `deleted` (tinyint 1) - Soft delete flag

**Schema:**
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

---

### source Table

**Purpose:** Traffic source catalog (e.g., "Adwords", "Facebook", "DrCash").

**Key Columns:**
- `id` (int, PK) - Unique source identifier
- `source` (varchar 600) - Source name
- `deleted` (tinyint 1) - Soft delete flag

**Schema:**
```sql
CREATE TABLE `source` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `source` varchar(600) NOT NULL,
  `deleted` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=670 DEFAULT CHARSET=utf8
```

---

### invoice_product Table

**Purpose:** Many-to-many junction table linking invoices to products.

**Key Columns:**
- `id` (int, PK) - Unique record identifier
- `invoice_id` (int, FK → invoice.id) - Invoice reference
- `product_id` (int, FK → product.id) - Product reference
- `product_sku`, `product_name` (varchar) - Denormalized product info
- `quantity` (int) - Product quantity
- `summary` (decimal 10,2) - Line item total

**Schema:**
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

---

### invoice_proccessed Table

**Purpose:** Tracks processed and paid invoices, indicates trial conversion.

**Key Columns:**
- `id` (int, PK) - Unique record identifier
- `invoice_id` (int, FK → invoice.id) - Related invoice
- `customer_id` (int, FK → customer.id) - Customer reference
- `date_paid` (datetime) - Payment date
- `date_bought` (date) - **Trial conversion date** (if trial was converted to paid)
- `total_paid` (decimal 10,2) - Amount paid

**Important:** `date_bought IS NOT NULL` indicates trial was converted to paid subscription.

**Schema:**
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
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`,`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8
```

---

### cancel_reason Table

**Purpose:** Catalog of cancellation reasons.

**Key Columns:**
- `primk` (int, PK) - Primary key
- `id` (int) - Reason ID
- `caption` (varchar 300) - Reason description

**Schema:**
```sql
CREATE TABLE `cancel_reason` (
  `primk` int(11) NOT NULL AUTO_INCREMENT,
  `id` int(11) NOT NULL,
  `caption` varchar(300) NOT NULL,
  PRIMARY KEY (`primk`),
  KEY `idx_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=89 DEFAULT CHARSET=latin1
```

---

### subscription_cancel_reason Table

**Purpose:** Many-to-many junction table linking subscriptions to cancel reasons.

**Key Columns:**
- `id` (int, PK) - Unique record identifier
- `subscription_id` (int, FK → subscription.id) - Subscription reference
- `cancel_reason_id` (int, FK → cancel_reason.id) - Reason reference
- `created_at`, `updated_at` (datetime) - Timestamps

**Schema:**
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

---

## UTM Parameter Mapping & Attribution

### Overview

The CRM stores UTM parameters from marketing campaigns in the `tracking_id` fields across `subscription`, `invoice`, and `customer` tables. Understanding this mapping is critical for attribution analysis.

**Standard UTM Parameters → CRM Fields:**

| UTM Parameter | CRM Storage Location | Field Name | Description |
|---------------|---------------------|------------|-------------|
| `utm_source` | `source` table | `source.source` | Traffic source (e.g., "Facebook", "Adwords") |
| `utm_medium` | tracking fields | `tracking_id` (or `tracking_id_1`) | Ad ID or creative ID |
| `utm_content` | tracking fields | `tracking_id_2` | Adset ID or ad group ID |
| `utm_term` | tracking fields | `tracking_id_3` | Keywords (Google Ads) |
| `utm_campaign` | tracking fields | `tracking_id_4` | Campaign ID |
| (click ID) | tracking fields | `tracking_id_5` | External click ID (fbclid, gclid) |

---

### Platform-Specific Mapping

#### Facebook (Meta) Ads

**UTM Structure:**
- `utm_source=facebook`
- `utm_medium={{ad.id}}` → Ad ID
- `utm_content={{adset.id}}` → Adset ID
- `utm_campaign={{campaign.id}}` → Campaign ID
- Additional: `{{placement}}` → Placement type

**Example URL:**
```
https://example.com/product?
utm_source=facebook&
utm_medium=23850635374960155&
utm_content=23850635374960154&
utm_campaign=23850635374960153&
placement=feed
```

**CRM Storage:**
```sql
source.source = 'Facebook'
tracking_id = '23850635374960155'    -- {{ad.id}}
tracking_id_2 = '23850635374960154'  -- {{adset.id}}
tracking_id_3 = NULL or ''           -- (not used)
tracking_id_4 = '23850635374960153'  -- {{campaign.id}}
tracking_id_5 = 'fbclid_...'         -- Facebook click ID
```

---

#### Google Ads (Adwords)

**UTM Structure:**
- `utm_source=adwords` (or `google`)
- `utm_medium={creative}` → Ad ID
- `utm_content={adgroupid}` → Ad Group ID
- `utm_campaign={campaignid}` → Campaign ID
- Additional: `{keyword}` → Keyword, `{placement}` → Placement

**Example URL:**
```
https://example.com/product?
utm_source=adwords&
utm_medium=669607105301&
utm_content=165025454108&
utm_campaign=21301173997&
keyword=weight+loss&
placement=www.example.com
```

**CRM Storage:**
```sql
source.source = 'Adwords'
tracking_id = '669607105301'         -- {creative}
tracking_id_2 = '165025454108'       -- {adgroupid}
tracking_id_3 = 'weight+loss'        -- {keyword} (optional)
tracking_id_4 = '21301173997'        -- {campaignid}
tracking_id_5 = 'gclid_...'          -- Google click ID
```

---

### tracking_id Field Reference

**Available in 3 tables:**
1. **subscription table** - Tracking at subscription creation
2. **invoice table** - Tracking at invoice/trial creation (may differ from subscription)
3. **customer table** - Tracking at customer registration

**Field Mapping:**

| Field | Common Name | Purpose | Example Values |
|-------|-------------|---------|----------------|
| `tracking_id` | TRK 1 | Ad ID / Creative ID | `23850635374960155`, `669607105301` |
| `tracking_id_2` | TRK 2 | Adset ID / Ad Group ID | `23850635374960154`, `165025454108` |
| `tracking_id_3` | TRK 3 | Keywords / Terms | `weight+loss`, `diet+pills` |
| `tracking_id_4` | TRK 4 | Campaign ID | `23850635374960153`, `21301173997` |
| `tracking_id_5` | TRK 5 | Click ID | `fbclid_...`, `gclid_...` |

**Note:** `customer.tracking_id` is varchar(120), others are varchar(300).

---

### Query Examples

#### 1. Get UTM Parameters for a Subscription

```typescript
interface SubscriptionUTM {
  subscription_id: number;
  utm_source: string;
  utm_medium: string;
  utm_content: string;
  utm_term: string;
  utm_campaign: string;
  click_id: string;
}

const utmData = await executeMariaDBQuery<SubscriptionUTM>(
  `SELECT
     s.id as subscription_id,
     COALESCE(sr.source, '(not set)') as utm_source,
     s.tracking_id as utm_medium,
     s.tracking_id_2 as utm_content,
     s.tracking_id_3 as utm_term,
     s.tracking_id_4 as utm_campaign,
     s.tracking_id_5 as click_id
   FROM subscription s
   LEFT JOIN source sr ON sr.id = s.source_id
   WHERE s.id = ?`,
  [subscriptionId]
);
```

---

#### 2. Filter Subscriptions by Campaign ID

```typescript
// Find all subscriptions from a specific Facebook campaign
const facebookCampaign = await executeMariaDBQuery(
  `SELECT
     s.id as subscription_id,
     s.customer_id,
     s.date_create,
     sr.source as utm_source,
     s.tracking_id_4 as campaign_id
   FROM subscription s
   LEFT JOIN source sr ON sr.id = s.source_id
   WHERE s.tracking_id_4 = ?
     AND LOWER(sr.source) = 'facebook'
     AND s.deleted = 0
   ORDER BY s.date_create DESC`,
  ['23850635374960153']
);
```

---

#### 3. Attribution Report by Source and Campaign

```typescript
interface AttributionReport {
  utm_source: string;
  campaign_id: string;
  subscription_count: number;
  trial_count: number;
  approved_trial_count: number;
  total_revenue: number;
}

const attributionReport = await executeMariaDBQuery<AttributionReport>(
  `SELECT
     COALESCE(sr.source, '(not set)') as utm_source,
     s.tracking_id_4 as campaign_id,
     COUNT(DISTINCT s.id) as subscription_count,
     COUNT(DISTINCT i.id) as trial_count,
     COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) as approved_trial_count,
     SUM(COALESCE(i.total, 0)) as total_revenue
   FROM subscription s
   LEFT JOIN source sr ON sr.id = s.source_id
   LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
   WHERE s.date_create BETWEEN ? AND ?
     AND s.deleted = 0
   GROUP BY sr.source, s.tracking_id_4
   ORDER BY subscription_count DESC`,
  [startDate, endDate]
);
```

---

#### 4. Find Subscriptions by Keyword (Google Ads)

```typescript
// Find Google Ads subscriptions by keyword
const keywordPerformance = await executeMariaDBQuery(
  `SELECT
     s.tracking_id_3 as keyword,
     COUNT(DISTINCT s.id) as subscription_count,
     SUM(s.trial_price + s.rebill_price) as total_revenue
   FROM subscription s
   INNER JOIN source sr ON sr.id = s.source_id
   WHERE LOWER(sr.source) IN ('adwords', 'google')
     AND s.tracking_id_3 IS NOT NULL
     AND s.tracking_id_3 <> ''
     AND s.deleted = 0
     AND s.date_create BETWEEN ? AND ?
   GROUP BY s.tracking_id_3
   ORDER BY subscription_count DESC`,
  [startDate, endDate]
);
```

---

#### 5. Cross-Platform Campaign Comparison

```typescript
interface PlatformComparison {
  platform: string;
  campaign_id: string;
  ad_id: string;
  adset_id: string;
  subscription_count: number;
  conversion_rate: number;
}

const platformComparison = await executeMariaDBQuery<PlatformComparison>(
  `SELECT
     COALESCE(sr.source, '(not set)') as platform,
     s.tracking_id_4 as campaign_id,
     s.tracking_id as ad_id,
     s.tracking_id_2 as adset_id,
     COUNT(DISTINCT s.id) as subscription_count,
     ROUND(
       COUNT(DISTINCT CASE WHEN ipr.date_bought IS NOT NULL THEN s.id END) * 100.0 /
       COUNT(DISTINCT s.id),
       2
     ) as conversion_rate
   FROM subscription s
   LEFT JOIN source sr ON sr.id = s.source_id
   LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
   LEFT JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id
   WHERE s.date_create BETWEEN ? AND ?
     AND s.deleted = 0
   GROUP BY sr.source, s.tracking_id_4, s.tracking_id, s.tracking_id_2
   ORDER BY subscription_count DESC`,
  [startDate, endDate]
);
```

---

#### 6. Track Click ID Performance

```typescript
// Analyze Facebook click ID performance
const clickIdPerformance = await executeMariaDBQuery(
  `SELECT
     s.tracking_id_5 as fbclid,
     COUNT(DISTINCT s.id) as subscription_count,
     COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END) as approved_count,
     SUM(COALESCE(i.total, 0)) as revenue
   FROM subscription s
   INNER JOIN source sr ON sr.id = s.source_id
   LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
   WHERE LOWER(sr.source) = 'facebook'
     AND s.tracking_id_5 IS NOT NULL
     AND s.tracking_id_5 <> ''
     AND s.tracking_id_5 <> 'null'
     AND LENGTH(s.tracking_id_5) > 20
     AND s.deleted = 0
     AND s.date_create BETWEEN ? AND ?
   GROUP BY s.tracking_id_5
   HAVING subscription_count > 1
   ORDER BY subscription_count DESC`,
  [startDate, endDate]
);
```

---

### Important Notes

#### 1. Source Table Values

The `source.source` field contains platform names, but **naming is inconsistent**:
- Google Ads: May be `"Adwords"`, `"Google"`, or variations
- Facebook: May be `"Facebook"`, `"Meta"`, or variations
- Always use **case-insensitive matching**: `LOWER(sr.source) = 'adwords'`

```sql
-- ✅ CORRECT: Case-insensitive matching
WHERE LOWER(sr.source) IN ('adwords', 'google')

-- ❌ WRONG: Case-sensitive matching
WHERE sr.source = 'Adwords'
```

---

#### 2. Tracking ID Data Quality

**Common Issues:**
- Empty strings: `tracking_id = ''`
- Literal 'null': `tracking_id = 'null'`
- Funnel IDs in tracking_id_5: Contains 'funnel' keyword
- Short/invalid IDs: `LENGTH(tracking_id_5) < 20`

**Always clean tracking IDs:**
```sql
CASE
  WHEN tracking_id_5 = 'null' THEN NULL
  WHEN tracking_id_5 = '' THEN NULL
  WHEN tracking_id_5 LIKE '%funnel%' THEN NULL
  WHEN LENGTH(tracking_id_5) < 20 THEN NULL
  ELSE tracking_id_5
END as clean_click_id
```

---

#### 3. Multi-Table Tracking

**Tracking IDs exist in 3 tables** with potentially different values:

```typescript
// Compare tracking across tables
const trackingComparison = await executeMariaDBQuery(
  `SELECT
     s.id as subscription_id,
     -- Subscription tracking (at subscription creation)
     s.tracking_id_4 as subscription_campaign_id,
     s.tracking_id_1 as subscription_ad_id,
     -- Invoice tracking (at trial creation)
     i.tracking_id_4 as trial_campaign_id,
     i.tracking_id_1 as trial_ad_id,
     -- Customer tracking (at registration)
     c.tracking_id_4 as customer_campaign_id,
     c.tracking_id as customer_ad_id
   FROM subscription s
   LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
   LEFT JOIN customer c ON s.customer_id = c.id
   WHERE s.id = ?`,
  [subscriptionId]
);
```

**Best Practice:** Use **subscription tracking** for attribution, as it's most accurate for subscription analysis.

---

#### 4. Platform Macro Syntax

**Facebook:** Uses double curly braces `{{macro}}`
- `{{campaign.id}}`, `{{adset.id}}`, `{{ad.id}}`, `{{placement}}`

**Google Ads:** Uses single curly braces `{macro}`
- `{campaignid}`, `{adgroupid}`, `{creative}`, `{keyword}`, `{placement}`

These macros are replaced by the ad platform before the user reaches your landing page, so you'll see actual values (numeric IDs) in the CRM.

---

#### 5. Missing UTM Parameters

**Handle missing data gracefully:**

```sql
-- Use COALESCE for default values
SELECT
  COALESCE(sr.source, '(not set)') as utm_source,
  COALESCE(s.tracking_id_4, '(no campaign)') as utm_campaign,
  COALESCE(s.tracking_id_1, '(no ad)') as utm_medium

-- Check for NULL or empty
WHERE (s.tracking_id_4 IS NOT NULL AND s.tracking_id_4 <> '')

-- Filter only records with complete tracking
WHERE s.tracking_id_1 IS NOT NULL
  AND s.tracking_id_2 IS NOT NULL
  AND s.tracking_id_4 IS NOT NULL
```

---

#### 6. Soft Delete Semantics

**What is soft delete?**
- Records marked `deleted = 1` are hidden from normal queries but not physically removed from the database
- Allows data recovery and audit trails
- Maintains referential integrity (foreign keys remain valid)

**deleted field values:**
- `0` = Active (normal records, shown in standard queries)
- `1` = Soft-deleted (hidden from standard queries, but data preserved)

**When to filter:**
- ✅ **ALWAYS filter in production queries:** Add `WHERE deleted = 0`
- ❌ **Don't filter in admin/audit queries:** Need to see deleted records
- ❌ **Don't filter in recovery queries:** Need to restore deleted data

**Can deleted records be restored?**
- Yes, by setting `deleted = 0` via UPDATE query
- Restore should verify data integrity first (check foreign keys still valid)
- May need to revalidate relationships before restoration

**Example patterns:**
```sql
-- ✅ CORRECT: Standard query (exclude deleted)
SELECT * FROM invoice
WHERE subscription_id = ? AND deleted = 0

-- Admin query (show all including deleted)
SELECT *, IF(deleted = 1, 'DELETED', 'ACTIVE') as status
FROM invoice
WHERE subscription_id = ?

-- Restore deleted record
UPDATE invoice
SET deleted = 0
WHERE id = ? AND deleted = 1

-- Soft delete a record
UPDATE subscription
SET deleted = 1, date_deleted = NOW()
WHERE id = ?
```

**Important:**
- Never use `DELETE FROM` unless you intend permanent removal
- Always include `deleted = 0` in WHERE clauses for production queries
- Log who deleted what and when (add date_deleted, deleted_by_user_id columns if needed)

---

### TypeScript Interface

```typescript
interface UTMParameters {
  utm_source: string;        // source.source
  utm_medium: string | null; // tracking_id (ad ID)
  utm_content: string | null;// tracking_id_2 (adset/adgroup ID)
  utm_term: string | null;   // tracking_id_3 (keyword)
  utm_campaign: string | null;// tracking_id_4 (campaign ID)
  click_id: string | null;   // tracking_id_5 (fbclid/gclid)
}

interface FacebookUTM extends UTMParameters {
  utm_source: 'Facebook' | 'facebook';
  ad_id: string;      // tracking_id
  adset_id: string;   // tracking_id_2
  campaign_id: string;// tracking_id_4
  fbclid: string;     // tracking_id_5
}

interface GoogleAdsUTM extends UTMParameters {
  utm_source: 'Adwords' | 'Google' | 'adwords' | 'google';
  creative_id: string;  // tracking_id
  adgroup_id: string;   // tracking_id_2
  keyword?: string;     // tracking_id_3
  campaign_id: string;  // tracking_id_4
  gclid: string;        // tracking_id_5
}
```

---

## Connection & Configuration

### Connection Pool Setup

**Location:** `lib/server/mariadb.ts`

**Configuration:**
```typescript
import { executeMariaDBQuery } from '@/lib/server/mariadb';

// Connection pool settings (singleton, lazy initialization)
const poolConfig = {
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,

  // Pool limits
  waitForConnections: true,
  connectionLimit: 10,      // Max 10 concurrent connections
  maxIdle: 10,              // Max idle connections
  idleTimeout: 60000,       // Close idle after 60s
  queueLimit: 0,            // No limit on queued requests

  // Timeout (critical for VPN/remote connections)
  connectTimeout: 30000,    // 30 seconds to establish connection

  // Keep-alive
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};
```

### Environment Variables

**Required in `.env.local`:**
```bash
MARIADB_HOST=your-host.com
MARIADB_PORT=3306
MARIADB_USER=your-username
MARIADB_PASSWORD=your-password
MARIADB_DATABASE=your-database
```

### Basic Query Execution

**Template:**
```typescript
import { executeMariaDBQuery } from '@/lib/server/mariadb';

// Simple query with no parameters
const allSources = await executeMariaDBQuery<Source>(
  'SELECT * FROM source WHERE deleted = 0'
);

// Parameterized query (use ? placeholders)
const subscription = await executeMariaDBQuery<Subscription>(
  'SELECT * FROM subscription WHERE id = ? AND deleted = 0',
  [subscriptionId]
);

// Multiple parameters
const subscriptions = await executeMariaDBQuery<Subscription>(
  'SELECT * FROM subscription WHERE customer_id = ? AND date_create BETWEEN ? AND ?',
  [customerId, startDate, endDate]
);
```

**CRITICAL:** Use `?` placeholders, NOT `$1, $2, $3` (that's PostgreSQL syntax).

### Testing Connection

```typescript
import { testMariaDBConnection } from '@/lib/server/mariadb';

// Health check
const isConnected = await testMariaDBConnection();
if (!isConnected) {
  console.error('Database connection failed');
}
```

---

## Query Patterns Library

### 1. Basic Queries

#### Simple SELECT with Date Range
```typescript
const subscriptions = await executeMariaDBQuery<Subscription>(
  `SELECT * FROM subscription
   WHERE date_create BETWEEN ? AND ?
     AND deleted = 0`,
  [startDate, endDate]
);
```

#### Filtering by Status
```typescript
// Active subscriptions
const active = await executeMariaDBQuery(
  `SELECT * FROM subscription
   WHERE status = 1 AND deleted = 0`,
  []
);

// Cancelled subscriptions
const cancelled = await executeMariaDBQuery(
  `SELECT * FROM subscription
   WHERE status IN (4, 5) AND deleted = 0`,
  []
);
```

#### Pagination with LIMIT/OFFSET
```typescript
const page = 2;
const pageSize = 50;
const offset = (page - 1) * pageSize;

const results = await executeMariaDBQuery(
  `SELECT * FROM subscription
   WHERE deleted = 0
   ORDER BY date_create DESC
   LIMIT ? OFFSET ?`,
  [pageSize, offset]
);
```

---

### 2. Customer Queries

#### New vs Existing Customer Classification
```typescript
const subscriptionsWithCustomerType = await executeMariaDBQuery(
  `SELECT
     s.id as subscription_id,
     s.customer_id,
     c.first_name,
     c.last_name,
     c.date_registered,
     s.date_create as subscription_date,
     IF(DATE(c.date_registered) = DATE(s.date_create), 'new', 'existing') as customer_type
   FROM subscription s
   INNER JOIN customer c ON s.customer_id = c.id
   WHERE s.date_create BETWEEN ? AND ?
     AND s.deleted = 0`,
  [startDate, endDate]
);
```

#### Customer Age Calculation
```typescript
const customersWithAge = await executeMariaDBQuery(
  `SELECT
     id,
     CONCAT(first_name, ' ', last_name) as customer_name,
     birthday,
     TIMESTAMPDIFF(YEAR, birthday, CURDATE()) as age
   FROM customer
   WHERE birthday IS NOT NULL
     AND deleted = 0`,
  []
);
```

#### Customer Demographics by Country
```typescript
const countryStats = await executeMariaDBQuery(
  `SELECT
     UPPER(TRIM(country)) as country,
     COUNT(*) as customer_count,
     COUNT(DISTINCT id) as unique_customers
   FROM customer
   WHERE country IS NOT NULL
     AND deleted = 0
   GROUP BY UPPER(TRIM(country))
   ORDER BY customer_count DESC`,
  []
);
```

---

### 3. Subscription Queries

#### Active Subscriptions with Customer and Product
```typescript
const activeSubscriptions = await executeMariaDBQuery(
  `SELECT
     s.id as subscription_id,
     CONCAT(c.first_name, ' ', c.last_name) as customer_name,
     c.email,
     p.product_name,
     p.sku,
     s.date_create,
     s.next_rebill_date
   FROM subscription s
   INNER JOIN customer c ON s.customer_id = c.id
   INNER JOIN product p ON s.product_id = p.id
   WHERE s.status = 1
     AND s.deleted = 0
   ORDER BY s.date_create DESC`,
  []
);
```

#### Subscription Status History
```typescript
const statusQuery = await executeMariaDBQuery(
  `SELECT
     id as subscription_id,
     status,
     CASE
       WHEN status = 1 THEN 'active'
       WHEN status = 4 THEN 'cancel_soft'
       WHEN status = 5 THEN 'cancel_forever'
       ELSE 'unknown'
     END as status_label,
     last_status_change,
     date_cancel,
     date_cancel_soft
   FROM subscription
   WHERE id = ?`,
  [subscriptionId]
);
```

#### Cancelled Subscriptions with Reasons
```typescript
const cancelledWithReasons = await executeMariaDBQuery(
  `SELECT
     s.id as subscription_id,
     s.customer_id,
     s.status,
     s.date_cancel,
     GROUP_CONCAT(cr.caption SEPARATOR ', ') as cancel_reasons,
     COUNT(cr.id) as reason_count
   FROM subscription s
   LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
   LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
   WHERE s.status IN (4, 5)
     AND s.deleted = 0
     AND s.date_cancel BETWEEN ? AND ?
   GROUP BY s.id
   ORDER BY s.date_cancel DESC`,
  [startDate, endDate]
);
```

---

### 4. Trial Queries

#### All Trials with Status
```typescript
const trials = await executeMariaDBQuery(
  `SELECT
     i.id as trial_id,
     i.subscription_id,
     i.customer_id,
     i.order_date as trial_created_at,
     i.total as trial_amount,
     IF(i.is_marked = 1, 'approved', 'pending') as approval_status,
     i.deleted
   FROM invoice i
   WHERE i.type = 1
     AND i.order_date BETWEEN ? AND ?
   ORDER BY i.order_date DESC`,
  [startDate, endDate]
);
```

#### Approved Trials Only
```typescript
const approvedTrials = await executeMariaDBQuery(
  `SELECT
     i.id as trial_id,
     s.id as subscription_id,
     CONCAT(c.first_name, ' ', c.last_name) as customer_name,
     i.order_date,
     i.total
   FROM invoice i
   INNER JOIN subscription s ON i.subscription_id = s.id
   INNER JOIN customer c ON s.customer_id = c.id
   WHERE i.type = 1
     AND i.is_marked = 1
     AND i.deleted = 0
   ORDER BY i.order_date DESC`,
  []
);
```

#### Paid/Converted Trials
```typescript
const convertedTrials = await executeMariaDBQuery(
  `SELECT
     i.id as trial_id,
     i.subscription_id,
     i.order_date as trial_created_at,
     ipr.date_paid as paid_at,
     ipr.date_bought as conversion_date,
     ipr.total_paid,
     IF(ipr.date_bought IS NOT NULL, 'converted', 'not_converted') as conversion_status
   FROM invoice i
   LEFT JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id
   WHERE i.type = 1
     AND i.deleted = 0
     AND i.subscription_id = ?`,
  [subscriptionId]
);
```

#### Trial Conversion Rate
```typescript
const conversionStats = await executeMariaDBQuery(
  `SELECT
     COUNT(i.id) as total_trials,
     COUNT(ipr.date_bought) as converted_trials,
     ROUND(COUNT(ipr.date_bought) * 100.0 / COUNT(i.id), 2) as conversion_rate_percent
   FROM invoice i
   LEFT JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id
   WHERE i.type = 1
     AND i.deleted = 0
     AND i.order_date BETWEEN ? AND ?`,
  [startDate, endDate]
);
```

---

### 5. Upsell Queries

#### Find All Upsells for a Subscription
```typescript
const upsells = await executeMariaDBQuery(
  `SELECT
     s.id as parent_subscription_id,
     uo.id as upsell_invoice_id,
     uo.type as upsell_type,
     CASE
       WHEN uo.type = 1 THEN 'subscription'
       WHEN uo.type = 3 THEN 'ots'
     END as upsell_type_label,
     uo.total as upsell_amount,
     uo.is_marked as is_approved,
     IF(uo.is_marked = 1, 'approved', 'pending') as approval_status,
     uo.order_date as upsell_date,
     up.product_name as upsell_product
   FROM subscription s
   INNER JOIN invoice uo ON uo.customer_id = s.customer_id
     AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
   LEFT JOIN invoice_product uip ON uip.invoice_id = uo.id
   LEFT JOIN product up ON up.id = uip.product_id
   WHERE s.id = ?
     AND uo.deleted = 0
   ORDER BY uo.order_date DESC`,
  [subscriptionId]
);
```

**Key Pattern:** Upsells are linked via `uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')`

#### Upsell Approval Status
```typescript
const upsellApprovalStats = await executeMariaDBQuery(
  `SELECT
     COUNT(*) as total_upsells,
     COUNT(CASE WHEN is_marked = 1 THEN 1 END) as approved_count,
     COUNT(CASE WHEN is_marked = 0 THEN 1 END) as pending_count,
     ROUND(COUNT(CASE WHEN is_marked = 1 THEN 1 END) * 100.0 / COUNT(*), 2) as approval_rate_percent
   FROM invoice
   WHERE type = 3
     AND deleted = 0
     AND order_date BETWEEN ? AND ?`,
  [startDate, endDate]
);
```

#### Upsells by Type (Subscription vs OTS)
```typescript
const upsellsByType = await executeMariaDBQuery(
  `SELECT
     type,
     CASE
       WHEN type = 1 THEN 'subscription'
       WHEN type = 3 THEN 'ots'
     END as type_label,
     COUNT(*) as upsell_count,
     SUM(total) as total_revenue
   FROM invoice
   WHERE type IN (1, 3)
     AND tag LIKE '%parent-sub-id=%'
     AND deleted = 0
     AND order_date BETWEEN ? AND ?
   GROUP BY type`,
  [startDate, endDate]
);
```

---

### 6. Product Queries

#### Products per Subscription
```typescript
const subscriptionProducts = await executeMariaDBQuery(
  `SELECT
     s.id as subscription_id,
     p.product_name,
     p.sku,
     ip.quantity,
     ip.summary as line_total
   FROM subscription s
   INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
   INNER JOIN invoice_product ip ON ip.invoice_id = i.id
   INNER JOIN product p ON p.id = ip.product_id
   WHERE s.id = ?`,
  [subscriptionId]
);
```

#### Product Performance Aggregation
```typescript
const productStats = await executeMariaDBQuery(
  `SELECT
     p.product_name,
     UPPER(TRIM(p.sku)) as product_sku,
     COUNT(DISTINCT s.id) as subscription_count,
     SUM(s.trial_price) as total_trial_revenue,
     SUM(s.rebill_price) as total_rebill_revenue
   FROM subscription s
   INNER JOIN product p ON s.product_id = p.id
   WHERE s.date_create BETWEEN ? AND ?
     AND s.deleted = 0
   GROUP BY p.id, p.product_name, p.sku
   ORDER BY subscription_count DESC`,
  [startDate, endDate]
);
```

---

### 7. Source/Attribution Queries

#### Traffic Source Breakdown
```typescript
const sourceBreakdown = await executeMariaDBQuery(
  `SELECT
     COALESCE(sr.source, '(not set)') as source,
     COUNT(DISTINCT s.id) as subscription_count,
     COUNT(DISTINCT s.customer_id) as unique_customers,
     SUM(s.trial_price + s.rebill_price) as total_revenue
   FROM subscription s
   LEFT JOIN source sr ON sr.id = s.source_id
   WHERE s.date_create BETWEEN ? AND ?
     AND s.deleted = 0
   GROUP BY sr.source
   ORDER BY subscription_count DESC`,
  [startDate, endDate]
);
```

#### Tracking ID Extraction (Clean)
```typescript
const trackingIds = await executeMariaDBQuery(
  `SELECT
     i.id,
     i.tracking_id,
     i.tracking_id_2,
     i.tracking_id_3,
     i.tracking_id_4,
     -- Clean tracking_id_5 (remove 'null', funnel-related, short IDs)
     CASE
       WHEN i.tracking_id_5 = 'null' THEN NULL
       WHEN i.tracking_id_5 LIKE '%funnel%' THEN NULL
       WHEN LENGTH(i.tracking_id_5) < 20 THEN NULL
       ELSE i.tracking_id_5
     END as external_click_id
   FROM invoice i
   WHERE i.subscription_id = ?`,
  [subscriptionId]
);
```

---

### 8. Aggregation Queries

#### Conditional COUNT with CASE
```typescript
const statusCounts = await executeMariaDBQuery(
  `SELECT
     COUNT(*) as total_subscriptions,
     COUNT(CASE WHEN status = 1 THEN 1 END) as active_count,
     COUNT(CASE WHEN status = 4 THEN 1 END) as soft_cancel_count,
     COUNT(CASE WHEN status = 5 THEN 1 END) as hard_cancel_count
   FROM subscription
   WHERE date_create BETWEEN ? AND ?
     AND deleted = 0`,
  [startDate, endDate]
);
```

#### DISTINCT Counting for Hierarchies
```typescript
const customerMetrics = await executeMariaDBQuery(
  `SELECT
     COUNT(DISTINCT s.customer_id) as unique_customers,
     COUNT(s.id) as total_subscriptions,
     ROUND(COUNT(s.id) * 1.0 / COUNT(DISTINCT s.customer_id), 2) as subscriptions_per_customer
   FROM subscription s
   WHERE s.date_create BETWEEN ? AND ?
     AND s.deleted = 0`,
  [startDate, endDate]
);
```

#### GROUP_CONCAT for Lists
```typescript
const subscriptionProducts = await executeMariaDBQuery(
  `SELECT
     s.id as subscription_id,
     GROUP_CONCAT(DISTINCT p.product_name SEPARATOR ', ') as products,
     COUNT(DISTINCT ip.product_id) as product_count
   FROM subscription s
   INNER JOIN invoice i ON i.subscription_id = s.id
   INNER JOIN invoice_product ip ON ip.invoice_id = i.id
   INNER JOIN product p ON p.id = ip.product_id
   WHERE s.id = ?
   GROUP BY s.id`,
  [subscriptionId]
);
```

---

### 9. Date Queries

#### DATE() vs DATETIME Comparisons
```typescript
// Compare dates only (ignore time)
const subscriptionsByDate = await executeMariaDBQuery(
  `SELECT
     DATE(date_create) as subscription_date,
     COUNT(*) as count
   FROM subscription
   WHERE DATE(date_create) = ?
     AND deleted = 0
   GROUP BY DATE(date_create)`,
  ['2026-01-28']
);

// Compare datetime (includes time)
const subscriptionsByDatetime = await executeMariaDBQuery(
  `SELECT * FROM subscription
   WHERE date_create BETWEEN ? AND ?`,
  ['2026-01-28 00:00:00', '2026-01-28 23:59:59']
);
```

#### Conditional Date Extraction
```typescript
const subscriptionDates = await executeMariaDBQuery(
  `SELECT
     id,
     date_create,
     -- Only show cancel date if actually cancelled
     IF(status IN (4, 5), DATE(date_cancel), NULL) as cancelled_at,
     last_status_change
   FROM subscription
   WHERE id = ?`,
  [subscriptionId]
);
```

---

### 10. Data Quality Queries

#### Null Handling with COALESCE
```typescript
const subscriptionsWithDefaults = await executeMariaDBQuery(
  `SELECT
     s.id,
     COALESCE(sr.source, '(not set)') as source,
     COALESCE(p.product_name, '(not set)') as product_name,
     COALESCE(s.tracking_id, '(no tracking)') as tracking_id
   FROM subscription s
   LEFT JOIN source sr ON sr.id = s.source_id
   LEFT JOIN product p ON p.id = s.product_id
   WHERE s.deleted = 0`,
  []
);
```

#### Data Normalization (UPPER, TRIM)
```typescript
const normalizedData = await executeMariaDBQuery(
  `SELECT
     UPPER(TRIM(c.first_name)) as firstname,
     UPPER(TRIM(c.last_name)) as lastname,
     UPPER(TRIM(c.place)) as city,
     UPPER(TRIM(c.country)) as country,
     LOWER(TRIM(c.email)) as email
   FROM customer c
   WHERE c.deleted = 0`,
  []
);
```

#### Soft Delete Filtering
```typescript
// Always filter soft-deleted records
const activeRecords = await executeMariaDBQuery(
  `SELECT * FROM subscription
   WHERE deleted = 0`,  // ← Critical filter
  []
);

// Include soft-deleted if needed (rare)
const allRecords = await executeMariaDBQuery(
  `SELECT
     *,
     IF(deleted = 1, 'deleted', 'active') as record_status
   FROM subscription`,
  []
);
```

---

## Common Use Cases

### Use Case 1: Find if a Subscription is an Upsell

**Question:** How do I determine if a subscription was created as an upsell from a parent subscription?

**Answer:** Check if the subscription's first invoice has a `tag` field containing `parent-sub-id=X`.

```typescript
interface UpsellCheck {
  subscription_id: number;
  customer_id: number;
  parent_subscription_id: string | null;
  is_upsell: 'yes' | 'no';
  upsell_type: string | null;
}

const checkIfUpsell = await executeMariaDBQuery<UpsellCheck>(
  `SELECT
     s.id as subscription_id,
     s.customer_id,
     -- Extract parent subscription ID from tag
     IF(i.tag LIKE '%parent-sub-id=%',
       SUBSTRING_INDEX(SUBSTRING_INDEX(i.tag, 'parent-sub-id=', -1), '&', 1),
       NULL
     ) as parent_subscription_id,
     IF(i.tag LIKE '%parent-sub-id=%', 'yes', 'no') as is_upsell,
     CASE
       WHEN i.type = 1 THEN 'subscription_upsell'
       WHEN i.type = 3 THEN 'ots_upsell'
       ELSE NULL
     END as upsell_type
   FROM subscription s
   LEFT JOIN invoice i ON i.subscription_id = s.id
   WHERE s.id = ?
   LIMIT 1`,
  [subscriptionId]
);

// Usage
const result = checkIfUpsell[0];
if (result.is_upsell === 'yes') {
  console.log(`Subscription ${result.subscription_id} is an upsell from subscription ${result.parent_subscription_id}`);
} else {
  console.log(`Subscription ${result.subscription_id} is an original subscription`);
}
```

**Key Pattern:** `i.tag LIKE '%parent-sub-id=%'`

---

### Use Case 2: Check if a Trial is Approved

**Question:** How do I check if a trial invoice has been approved/validated?

**Answer:** Check the `invoice.is_marked` field. `is_marked = 1` means approved, `0` means pending/rejected.

```typescript
interface TrialApprovalStatus {
  trial_id: number;
  subscription_id: number;
  customer_name: string;
  customer_email: string;
  trial_amount: number;
  order_date: string;
  is_marked: number;
  approval_status: 'approved' | 'pending';
  is_deleted: number;
}

const checkTrialApproval = await executeMariaDBQuery<TrialApprovalStatus>(
  `SELECT
     i.id as trial_id,
     i.subscription_id,
     CONCAT(c.first_name, ' ', c.last_name) as customer_name,
     c.email as customer_email,
     i.total as trial_amount,
     i.order_date,
     i.is_marked,
     IF(i.is_marked = 1, 'approved', 'pending') as approval_status,
     i.deleted as is_deleted
   FROM invoice i
   INNER JOIN subscription s ON i.subscription_id = s.id
   INNER JOIN customer c ON s.customer_id = c.id
   WHERE i.type = 1  -- Trial type
     AND i.subscription_id = ?`,
  [subscriptionId]
);

// Usage
const trial = checkTrialApproval[0];
if (trial.approval_status === 'approved') {
  console.log(`Trial ${trial.trial_id} is approved`);
} else {
  console.log(`Trial ${trial.trial_id} is pending approval`);
}
```

**Key Fields:**
- `is_marked = 1` → Approved
- `is_marked = 0` → Pending/rejected
- `deleted = 0` → Active (not soft-deleted)

---

### Use Case 3: Check if a Trial was Paid/Converted

**Question:** How do I check if a trial was converted to a paid subscription?

**Answer:** Check if `invoice_proccessed.date_bought` is not null. This indicates the trial was converted.

```typescript
interface TrialConversionStatus {
  trial_id: number;
  subscription_id: number;
  trial_created_at: string;
  trial_amount: number;
  is_converted: boolean;
  conversion_date: string | null;
  paid_at: string | null;
  total_paid: number | null;
}

const checkTrialConversion = await executeMariaDBQuery<TrialConversionStatus>(
  `SELECT
     i.id as trial_id,
     s.id as subscription_id,
     i.order_date as trial_created_at,
     i.total as trial_amount,
     ipr.date_bought IS NOT NULL as is_converted,
     DATE(ipr.date_bought) as conversion_date,
     ipr.date_paid as paid_at,
     ipr.total_paid
   FROM subscription s
   INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
   LEFT JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id
   WHERE s.id = ?
     AND i.deleted = 0`,
  [subscriptionId]
);

// Usage
const trial = checkTrialConversion[0];
if (trial.is_converted) {
  console.log(`Trial converted on ${trial.conversion_date}`);
} else {
  console.log('Trial not yet converted');
}
```

**Key Indicator:** `ipr.date_bought IS NOT NULL` means trial was converted to paid.

---

### Use Case 4: Find All Upsells for a Subscription

**Question:** How do I find all upsells that were offered to a customer after their initial subscription?

**Answer:** Join invoices where `tag` contains the parent subscription ID.

```typescript
interface UpsellRecord {
  parent_subscription_id: number;
  upsell_invoice_id: number;
  upsell_type: 'subscription' | 'ots';
  upsell_product: string;
  upsell_amount: number;
  upsell_date: string;
  is_approved: boolean;
  approval_status: 'approved' | 'pending';
  is_deleted: boolean;
}

const findUpsells = await executeMariaDBQuery<UpsellRecord>(
  `SELECT
     s.id as parent_subscription_id,
     uo.id as upsell_invoice_id,
     CASE
       WHEN uo.type = 1 THEN 'subscription'
       WHEN uo.type = 3 THEN 'ots'
     END as upsell_type,
     COALESCE(up.product_name, '(not set)') as upsell_product,
     uo.total as upsell_amount,
     DATE(uo.order_date) as upsell_date,
     uo.is_marked = 1 as is_approved,
     IF(uo.is_marked = 1, 'approved', 'pending') as approval_status,
     uo.deleted = 1 as is_deleted
   FROM subscription s
   INNER JOIN invoice uo ON uo.customer_id = s.customer_id
     AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
   LEFT JOIN invoice_product uip ON uip.invoice_id = uo.id
   LEFT JOIN product up ON up.id = uip.product_id
   WHERE s.id = ?
     AND uo.deleted = 0  -- Exclude soft-deleted
   ORDER BY uo.order_date ASC`,
  [subscriptionId]
);

// Usage
console.log(`Found ${findUpsells.length} upsells for subscription ${subscriptionId}`);
findUpsells.forEach(upsell => {
  console.log(`- ${upsell.upsell_product} (${upsell.upsell_type}): ${upsell.upsell_amount} on ${upsell.upsell_date}`);
});
```

**Critical JOIN Pattern:**
```sql
INNER JOIN invoice uo ON uo.customer_id = s.customer_id
  AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
```

---

### Use Case 5: Distinguish New vs Existing Customers

**Question:** How do I determine if a customer is new or existing when they create a subscription?

**Answer:** Compare customer registration date with subscription creation date. If same day, customer is new.

```typescript
interface CustomerTypeClassification {
  subscription_id: number;
  customer_id: number;
  customer_name: string;
  date_registered: string;
  subscription_date: string;
  is_new_customer: boolean;
  customer_type: 'new' | 'existing';
  days_since_registration: number;
}

const classifyCustomer = await executeMariaDBQuery<CustomerTypeClassification>(
  `SELECT
     s.id as subscription_id,
     c.id as customer_id,
     CONCAT(c.first_name, ' ', c.last_name) as customer_name,
     DATE(c.date_registered) as date_registered,
     DATE(s.date_create) as subscription_date,
     DATE(c.date_registered) = DATE(s.date_create) as is_new_customer,
     IF(DATE(c.date_registered) = DATE(s.date_create), 'new', 'existing') as customer_type,
     DATEDIFF(s.date_create, c.date_registered) as days_since_registration
   FROM subscription s
   INNER JOIN customer c ON s.customer_id = c.id
   WHERE s.id = ?`,
  [subscriptionId]
);

// Usage
const result = classifyCustomer[0];
if (result.customer_type === 'new') {
  console.log(`Customer registered and subscribed on the same day (${result.subscription_date})`);
} else {
  console.log(`Existing customer (registered ${result.days_since_registration} days before subscription)`);
}
```

**Key Formula:** `DATE(c.date_registered) = DATE(s.date_create)` → New customer

---

### Use Case 6: Get Subscription Cancel Reasons

**Question:** How do I retrieve the reasons why a subscription was cancelled?

**Answer:** Join through `subscription_cancel_reason` to `cancel_reason` table, use `GROUP_CONCAT` to combine multiple reasons.

```typescript
interface SubscriptionCancelInfo {
  subscription_id: number;
  status: number;
  status_label: string;
  date_cancel: string | null;
  cancel_reasons: string | null;
  reason_count: number;
}

const getCancelReasons = await executeMariaDBQuery<SubscriptionCancelInfo>(
  `SELECT
     s.id as subscription_id,
     s.status,
     CASE
       WHEN s.status = 1 THEN 'active'
       WHEN s.status = 4 THEN 'cancel_soft'
       WHEN s.status = 5 THEN 'cancel_forever'
     END as status_label,
     DATE(s.date_cancel) as date_cancel,
     GROUP_CONCAT(cr.caption SEPARATOR ', ') as cancel_reasons,
     COUNT(cr.id) as reason_count
   FROM subscription s
   LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
   LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
   WHERE s.id = ?
   GROUP BY s.id`,
  [subscriptionId]
);

// Usage
const sub = getCancelReasons[0];
if (sub.status_label === 'active') {
  console.log('Subscription is active (not cancelled)');
} else {
  console.log(`Cancelled on ${sub.date_cancel}`);
  console.log(`Reasons: ${sub.cancel_reasons}`);
  console.log(`Number of reasons: ${sub.reason_count}`);
}
```

**Key Pattern:** `GROUP_CONCAT(cr.caption SEPARATOR ', ')` combines multiple reasons into one field.

---

### Use Case 7: Find Refunded Trials

**Question:** How do I find trials that were paid but then refunded?

**Answer:** Join `invoice` (type=1) → `invoice_proccessed` → `invoice` (type=4, parent_id match).

```typescript
interface RefundedTrial {
  trial_id: number;
  subscription_id: number;
  trial_amount: number;
  paid_at: string | null;
  refund_id: number | null;
  refund_date: string | null;
  refund_amount: number | null;
  is_refunded: boolean;
}

const findRefundedTrials = await executeMariaDBQuery<RefundedTrial>(
  `SELECT
     i.id as trial_id,
     i.subscription_id,
     i.total as trial_amount,
     ipr.date_paid as paid_at,
     irf.id as refund_id,
     DATE(irf.order_date) as refund_date,
     irf.total as refund_amount,
     irf.id IS NOT NULL as is_refunded
   FROM invoice i
   INNER JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id
   LEFT JOIN invoice irf ON irf.parent_id = ipr.id AND irf.type = 4
   WHERE i.type = 1  -- Trial
     AND i.subscription_id = ?
     AND i.deleted = 0`,
  [subscriptionId]
);

// Usage
const trial = findRefundedTrials[0];
if (trial.is_refunded) {
  console.log(`Trial ${trial.trial_id} was refunded on ${trial.refund_date} for ${trial.refund_amount}`);
} else {
  console.log('Trial has not been refunded');
}
```

**Key JOIN:** `LEFT JOIN invoice irf ON irf.parent_id = ipr.id AND irf.type = 4`

---

### Use Case 8: Get Clean Tracking IDs

**Question:** How do I extract tracking IDs while filtering out invalid/junk data?

**Answer:** Use CASE statement to filter out 'null' strings, funnel-related IDs, and short IDs.

```typescript
interface CleanTrackingIds {
  invoice_id: number;
  tracking_id: string | null;
  tracking_id_2: string | null;
  tracking_id_3: string | null;
  tracking_id_4: string | null;
  external_click_id: string | null;
}

const getCleanTrackingIds = await executeMariaDBQuery<CleanTrackingIds>(
  `SELECT
     i.id as invoice_id,
     i.tracking_id,
     i.tracking_id_2,
     i.tracking_id_3,
     i.tracking_id_4,
     -- Clean tracking_id_5
     CASE
       WHEN i.tracking_id_5 = 'null' THEN NULL
       WHEN i.tracking_id_5 LIKE '%funnel%' THEN NULL
       WHEN LENGTH(i.tracking_id_5) < 20 THEN NULL
       ELSE i.tracking_id_5
     END as external_click_id
   FROM invoice i
   WHERE i.subscription_id = ?`,
  [subscriptionId]
);

// Usage
const ids = getCleanTrackingIds[0];
if (ids.external_click_id) {
  console.log(`Valid external click ID: ${ids.external_click_id}`);
} else {
  console.log('No valid external click ID');
}
```

**Cleaning Rules:**
1. Remove literal 'null' strings
2. Remove funnel-related tracking IDs
3. Remove short IDs (< 20 characters)

---

### Use Case 9: Active Subscriptions by Country

**Question:** How do I get a breakdown of active subscriptions by customer country?

**Answer:** Join subscription → customer, group by normalized country, filter for active status.

```typescript
interface CountryBreakdown {
  country: string;
  subscription_count: number;
  unique_customers: number;
  total_trial_revenue: number;
  total_rebill_revenue: number;
}

const subscriptionsByCountry = await executeMariaDBQuery<CountryBreakdown>(
  `SELECT
     UPPER(TRIM(c.country)) as country,
     COUNT(s.id) as subscription_count,
     COUNT(DISTINCT s.customer_id) as unique_customers,
     SUM(s.trial_price) as total_trial_revenue,
     SUM(s.rebill_price) as total_rebill_revenue
   FROM subscription s
   INNER JOIN customer c ON s.customer_id = c.id
   WHERE s.status = 1
     AND s.deleted = 0
     AND c.country IS NOT NULL
   GROUP BY UPPER(TRIM(c.country))
   ORDER BY subscription_count DESC`,
  []
);

// Usage
console.log('Active subscriptions by country:');
subscriptionsByCountry.forEach(row => {
  console.log(`${row.country}: ${row.subscription_count} subscriptions from ${row.unique_customers} customers`);
});
```

**Note:** Always normalize country with `UPPER(TRIM(c.country))` for consistent grouping.

---

### Use Case 10: Customer Age Distribution

**Question:** How do I analyze customer age demographics?

**Answer:** Use `TIMESTAMPDIFF(YEAR, birthday, CURDATE())` to calculate age, then group by age ranges.

```typescript
interface AgeDistribution {
  age_range: string;
  customer_count: number;
  subscription_count: number;
}

const ageDistribution = await executeMariaDBQuery<AgeDistribution>(
  `SELECT
     CASE
       WHEN TIMESTAMPDIFF(YEAR, c.birthday, CURDATE()) < 25 THEN '18-24'
       WHEN TIMESTAMPDIFF(YEAR, c.birthday, CURDATE()) < 35 THEN '25-34'
       WHEN TIMESTAMPDIFF(YEAR, c.birthday, CURDATE()) < 45 THEN '35-44'
       WHEN TIMESTAMPDIFF(YEAR, c.birthday, CURDATE()) < 55 THEN '45-54'
       WHEN TIMESTAMPDIFF(YEAR, c.birthday, CURDATE()) < 65 THEN '55-64'
       ELSE '65+'
     END as age_range,
     COUNT(DISTINCT c.id) as customer_count,
     COUNT(s.id) as subscription_count
   FROM customer c
   LEFT JOIN subscription s ON s.customer_id = c.id AND s.deleted = 0
   WHERE c.birthday IS NOT NULL
     AND c.deleted = 0
   GROUP BY age_range
   ORDER BY MIN(TIMESTAMPDIFF(YEAR, c.birthday, CURDATE()))`,
  []
);

// Usage
console.log('Customer age distribution:');
ageDistribution.forEach(row => {
  console.log(`${row.age_range}: ${row.customer_count} customers, ${row.subscription_count} subscriptions`);
});
```

---

### Use Case 11: Product SKU Normalization

**Question:** How do I query products while handling inconsistent SKU formatting?

**Answer:** Always use `UPPER(TRIM(sku))` for SKU comparisons.

```typescript
const findProductBySku = await executeMariaDBQuery(
  `SELECT
     id,
     product_name,
     UPPER(TRIM(sku)) as normalized_sku,
     trial_price,
     rebill_price
   FROM product
   WHERE UPPER(TRIM(sku)) = ?
     AND deleted = 0`,
  [userInputSku.toUpperCase().trim()]
);
```

---

### Use Case 12: Subscription Lifecycle Tracking

**Question:** How do I track a subscription from trial → paid → cancel?

**Answer:** Join all relevant tables to create a complete lifecycle view.

```typescript
interface SubscriptionLifecycle {
  subscription_id: number;
  customer_name: string;
  product_name: string;

  // Trial phase
  trial_created_at: string;
  trial_amount: number;
  trial_approved: boolean;

  // Payment phase
  trial_converted: boolean;
  conversion_date: string | null;

  // Active phase
  subscription_status: string;
  last_rebill_date: string | null;

  // Cancel phase
  is_cancelled: boolean;
  cancel_date: string | null;
  cancel_reasons: string | null;

  // Upsells
  has_upsells: boolean;
  upsell_count: number;
}

const getSubscriptionLifecycle = await executeMariaDBQuery<SubscriptionLifecycle>(
  `SELECT
     s.id as subscription_id,
     CONCAT(c.first_name, ' ', c.last_name) as customer_name,
     p.product_name,

     -- Trial phase
     i.order_date as trial_created_at,
     i.total as trial_amount,
     i.is_marked = 1 as trial_approved,

     -- Payment phase
     ipr.date_bought IS NOT NULL as trial_converted,
     DATE(ipr.date_bought) as conversion_date,

     -- Active phase
     CASE
       WHEN s.status = 1 THEN 'active'
       WHEN s.status = 4 THEN 'cancel_soft'
       WHEN s.status = 5 THEN 'cancel_forever'
     END as subscription_status,
     s.last_rebill_date,

     -- Cancel phase
     s.status IN (4, 5) as is_cancelled,
     s.date_cancel as cancel_date,
     (SELECT GROUP_CONCAT(cr.caption SEPARATOR ', ')
      FROM subscription_cancel_reason scr
      JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE scr.subscription_id = s.id) as cancel_reasons,

     -- Upsells
     s.has_upsell as has_upsells,
     (SELECT COUNT(*) FROM invoice uo
      WHERE uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
        AND uo.deleted = 0) as upsell_count
   FROM subscription s
   INNER JOIN customer c ON s.customer_id = c.id
   INNER JOIN product p ON s.product_id = p.id
   LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
   LEFT JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id
   WHERE s.id = ?`,
  [subscriptionId]
);
```

---

### Use Case 13: Upsell Approval Rates

**Question:** How do I calculate approval rates for upsells over time?

**Answer:** Group upsells by date, calculate approval percentage.

```typescript
interface UpsellApprovalRate {
  date: string;
  total_upsells: number;
  approved_count: number;
  pending_count: number;
  approval_rate_percent: number;
}

const upsellApprovalRates = await executeMariaDBQuery<UpsellApprovalRate>(
  `SELECT
     DATE(order_date) as date,
     COUNT(*) as total_upsells,
     COUNT(CASE WHEN is_marked = 1 THEN 1 END) as approved_count,
     COUNT(CASE WHEN is_marked = 0 THEN 1 END) as pending_count,
     ROUND(COUNT(CASE WHEN is_marked = 1 THEN 1 END) * 100.0 / COUNT(*), 2) as approval_rate_percent
   FROM invoice
   WHERE type = 3
     AND deleted = 0
     AND order_date BETWEEN ? AND ?
   GROUP BY DATE(order_date)
   ORDER BY date`,
  [startDate, endDate]
);
```

---

### Use Case 14: Multi-Product Subscriptions

**Question:** How do I handle subscriptions with multiple products?

**Answer:** Join through `invoice_product` to get all products for a subscription.

```typescript
interface SubscriptionProduct {
  subscription_id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  quantity: number;
  line_total: number;
}

const getSubscriptionProducts = await executeMariaDBQuery<SubscriptionProduct>(
  `SELECT
     s.id as subscription_id,
     p.id as product_id,
     p.product_name,
     UPPER(TRIM(p.sku)) as product_sku,
     ip.quantity,
     ip.summary as line_total
   FROM subscription s
   INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
   INNER JOIN invoice_product ip ON ip.invoice_id = i.id
   INNER JOIN product p ON p.id = ip.product_id
   WHERE s.id = ?
   ORDER BY p.product_name`,
  [subscriptionId]
);

// Usage
console.log(`Subscription ${subscriptionId} products:`);
getSubscriptionProducts.forEach(prod => {
  console.log(`- ${prod.product_name} (${prod.product_sku}) x${prod.quantity} = ${prod.line_total}`);
});
```

---

### Use Case 15: Revenue Calculations

**Question:** How do I calculate total revenue including trials, rebills, and upsells?

**Answer:** Sum all invoice types with appropriate filters.

```typescript
interface RevenueBreakdown {
  subscription_id: number;
  trial_revenue: number;
  rebill_revenue: number;
  upsell_revenue: number;
  total_revenue: number;
}

const calculateRevenue = await executeMariaDBQuery<RevenueBreakdown>(
  `SELECT
     s.id as subscription_id,
     -- Trial revenue (type 1)
     COALESCE((SELECT SUM(i.total)
       FROM invoice i
       WHERE i.subscription_id = s.id
         AND i.type = 1
         AND i.deleted = 0), 0) as trial_revenue,
     -- Rebill revenue (would need rebill invoices)
     0 as rebill_revenue,
     -- Upsell revenue (type 3, linked via tag)
     COALESCE((SELECT SUM(uo.total)
       FROM invoice uo
       WHERE uo.customer_id = s.customer_id
         AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
         AND uo.deleted = 0), 0) as upsell_revenue,
     -- Total
     COALESCE((SELECT SUM(i.total)
       FROM invoice i
       WHERE i.subscription_id = s.id
         AND i.deleted = 0), 0) +
     COALESCE((SELECT SUM(uo.total)
       FROM invoice uo
       WHERE uo.customer_id = s.customer_id
         AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
         AND uo.deleted = 0), 0) as total_revenue
   FROM subscription s
   WHERE s.id = ?`,
  [subscriptionId]
);
```

---

### Use Case 16: Cohort Analysis

**Question:** How do I analyze subscription cohorts by registration month?

**Answer:** Group by registration month, track lifecycle metrics.

```typescript
interface CohortMetrics {
  cohort_month: string;
  new_customers: number;
  total_subscriptions: number;
  active_subscriptions: number;
  cancelled_subscriptions: number;
  retention_rate_percent: number;
}

const cohortAnalysis = await executeMariaDBQuery<CohortMetrics>(
  `SELECT
     DATE_FORMAT(c.date_registered, '%Y-%m') as cohort_month,
     COUNT(DISTINCT c.id) as new_customers,
     COUNT(s.id) as total_subscriptions,
     COUNT(CASE WHEN s.status = 1 THEN 1 END) as active_subscriptions,
     COUNT(CASE WHEN s.status IN (4,5) THEN 1 END) as cancelled_subscriptions,
     ROUND(COUNT(CASE WHEN s.status = 1 THEN 1 END) * 100.0 / COUNT(s.id), 2) as retention_rate_percent
   FROM customer c
   LEFT JOIN subscription s ON s.customer_id = c.id AND s.deleted = 0
   WHERE c.date_registered BETWEEN ? AND ?
     AND c.deleted = 0
   GROUP BY DATE_FORMAT(c.date_registered, '%Y-%m')
   ORDER BY cohort_month`,
  [startDate, endDate]
);
```

---

## Advanced Patterns

### Hierarchical Queries with Depth-Based Routing

**Pattern:** Used in `dashboardQueryBuilder.ts` for dimensional drill-down.

```typescript
// Example: Campaign → Ad Group → Keyword hierarchy
function buildGroupByClause(dimensions: string[]): string {
  const columnMap: Record<string, string> = {
    campaign: 'campaign_name',
    adGroup: 'ad_group_name',
    keyword: 'keyword_text',
  };

  return dimensions.map(dim => columnMap[dim]).join(', ');
}

// Query with hierarchy
const hierarchicalData = await executeMariaDBQuery(
  `SELECT
     ${buildGroupByClause(dimensions)},
     COUNT(*) as record_count
   FROM subscription s
   WHERE date_create BETWEEN ? AND ?
   GROUP BY ${buildGroupByClause(dimensions)}
   ORDER BY record_count DESC`,
  [startDate, endDate]
);
```

**Key Concept:** Parent filter building for child data loading.

```typescript
function buildParentFilter(parentKey: string, depth: number): string {
  if (!parentKey) return '';

  const keys = parentKey.split('::');
  return keys.map((key, i) => `${dimensions[i]} = ?`).join(' AND ');
}
```

---

### Complex Aggregations with Window Functions

**Note:** MariaDB 10.2+ supports window functions.

```typescript
// Rank subscriptions by revenue within each country
const rankedSubscriptions = await executeMariaDBQuery(
  `SELECT
     s.id,
     c.country,
     s.trial_price + s.rebill_price as total_revenue,
     ROW_NUMBER() OVER (PARTITION BY c.country ORDER BY s.trial_price + s.rebill_price DESC) as revenue_rank
   FROM subscription s
   INNER JOIN customer c ON s.customer_id = c.id
   WHERE s.deleted = 0`,
  []
);
```

---

### Dynamic Query Building

**Pattern:** Used in `dashboardDetailQueryBuilder.ts` for flexible filtering.

```typescript
interface FilterClause {
  whereClause: string;
  params: any[];
}

function buildFilterClause(filters: {
  country?: string;
  product?: string;
  source?: string;
}): FilterClause {
  const params: any[] = [];
  const conditions: string[] = [];

  if (filters.country) {
    conditions.push('c.country = ?');
    params.push(filters.country);
  }

  if (filters.product) {
    conditions.push('p.product_name = ?');
    params.push(filters.product);
  }

  if (filters.source) {
    conditions.push('sr.source = ?');
    params.push(filters.source);
  }

  return {
    whereClause: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
    params,
  };
}

// Usage
const { whereClause, params: filterParams } = buildFilterClause(filters);
const query = `
  SELECT * FROM subscription s
  INNER JOIN customer c ON s.customer_id = c.id
  WHERE s.date_create BETWEEN ? AND ?
    ${whereClause}
`;
const allParams = [startDate, endDate, ...filterParams];
```

---

### Subqueries for Aggregation

```typescript
const subscriptionsWithUpsellCount = await executeMariaDBQuery(
  `SELECT
     s.id,
     s.customer_id,
     (SELECT COUNT(*)
      FROM invoice uo
      WHERE uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
        AND uo.deleted = 0) as upsell_count,
     (SELECT SUM(uo.total)
      FROM invoice uo
      WHERE uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
        AND uo.deleted = 0) as upsell_revenue
   FROM subscription s
   WHERE s.deleted = 0`,
  []
);
```

---

### Transaction Patterns

**Note:** MariaDB supports transactions. Use for multi-table updates.

```typescript
import mysql from 'mysql2/promise';
import { getPool } from '@/lib/server/mariadb';

async function updateSubscriptionWithCancel(
  subscriptionId: number,
  cancelReasonId: number
): Promise<void> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Update subscription status
    await connection.execute(
      'UPDATE subscription SET status = 5, date_cancel = NOW() WHERE id = ?',
      [subscriptionId]
    );

    // Add cancel reason
    await connection.execute(
      'INSERT INTO subscription_cancel_reason (subscription_id, cancel_reason_id, created_at) VALUES (?, ?, NOW())',
      [subscriptionId, cancelReasonId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
```

---

## Performance & Optimization

### Index Usage

**Always use indexed columns in WHERE clauses:**

```typescript
// ✅ GOOD: Uses date_create index
const query1 = `
  SELECT * FROM subscription
  WHERE date_create BETWEEN ? AND ?
    AND deleted = 0
`;

// ❌ BAD: YEAR() prevents index usage
const query2 = `
  SELECT * FROM subscription
  WHERE YEAR(date_create) = 2026
`;

// ✅ BETTER: Use date range instead
const query3 = `
  SELECT * FROM subscription
  WHERE date_create BETWEEN '2026-01-01' AND '2026-12-31'
`;
```

**Key Indexes:**
- `subscription.date_create_idx` - Use for date range queries
- `subscription.customer_id` - Use when filtering by customer
- `invoice.idx_order_date` - Use for invoice date queries
- `invoice.idx_deleted_type` - Use when filtering by deleted/type

---

### JOIN Optimization

**INNER JOIN vs LEFT JOIN:**

```typescript
// Use INNER JOIN when record must exist in both tables
const query1 = `
  SELECT s.*, c.*
  FROM subscription s
  INNER JOIN customer c ON s.customer_id = c.id  -- Customer MUST exist
`;

// Use LEFT JOIN when record may not exist
const query2 = `
  SELECT s.*, sr.*
  FROM subscription s
  LEFT JOIN source sr ON sr.id = s.source_id  -- Source may be NULL
`;
```

**JOIN Order Matters:** Put the table with fewest rows first (if not using INNER JOIN).

---

### Large Result Sets

**Use LIMIT with OFFSET for pagination:**

```typescript
// ✅ GOOD: Pagination with reasonable offset
const page1 = await executeMariaDBQuery(
  'SELECT * FROM subscription LIMIT 50 OFFSET 0',
  []
);

// ⚠️ SLOW: Large offset is inefficient
const page1000 = await executeMariaDBQuery(
  'SELECT * FROM subscription LIMIT 50 OFFSET 50000',
  []
);

// ✅ BETTER: Use keyset pagination for large offsets
const pageKeyset = await executeMariaDBQuery(
  'SELECT * FROM subscription WHERE id > ? ORDER BY id LIMIT 50',
  [lastSeenId]
);
```

---

### Query Result Caching

**Pattern:** Cache expensive queries in application layer.

```typescript
import { cache } from 'react';

// Next.js 13+ automatic caching for GET requests
export const getCachedSubscriptions = cache(async () => {
  return await executeMariaDBQuery(
    'SELECT * FROM subscription WHERE deleted = 0',
    []
  );
});
```

---

### EXPLAIN Usage

**Always analyze slow queries:**

```typescript
const explainResult = await executeMariaDBQuery(
  `EXPLAIN SELECT * FROM subscription s
   INNER JOIN customer c ON s.customer_id = c.id
   WHERE s.date_create > '2026-01-01'`,
  []
);

console.log('Query plan:', explainResult);
// Look for:
// - type: ALL (bad - full table scan)
// - type: range (good - using index)
// - type: ref (good - using index for equality)
```

---

## Error Handling

### Common Errors

#### 1. Unknown Column Error

**Error:** `Unknown column 'c.customer_name' in 'field list'`

**Cause:** Column doesn't exist in table schema.

**Solution:** Check schema, use correct column names or `CONCAT(first_name, ' ', last_name)`.

```typescript
// ❌ WRONG: customer_name doesn't exist
const wrong = `SELECT c.customer_name FROM customer c`;

// ✅ CORRECT: Concatenate first and last name
const correct = `SELECT CONCAT(c.first_name, ' ', c.last_name) as customer_name FROM customer c`;
```

---

#### 2. Connection Timeout

**Error:** `connect ETIMEDOUT` or `Error: Connection lost: The server closed the connection`

**Cause:** VPN disconnected, remote server unreachable, or timeout too short.

**Solution:** Increase `connectTimeout` in pool config, check VPN connection.

```typescript
const poolConfig = {
  connectTimeout: 30000,  // Increase to 30 seconds
  enableKeepAlive: true,
};
```

---

#### 3. Type Mismatch

**Error:** `Incorrect integer value` or `Truncated incorrect DOUBLE value`

**Cause:** Passing wrong data type to parameterized query.

**Solution:** Ensure parameter types match column types.

```typescript
// ❌ WRONG: Passing string to integer column
const wrong = await executeMariaDBQuery(
  'SELECT * FROM subscription WHERE id = ?',
  ['123']  // String
);

// ✅ CORRECT: Pass integer
const correct = await executeMariaDBQuery(
  'SELECT * FROM subscription WHERE id = ?',
  [123]  // Number
);
```

---

#### 4. Prepared Statement Errors with Views

**Error:** `Prepared statement needs to be re-prepared`

**Cause:** MariaDB views have issues with prepared statements.

**Solution:** Use `pool.query()` instead of `pool.execute()` when querying views, or query underlying tables directly.

```typescript
// For views: Use query() not execute()
const [rows] = params.length > 0
  ? await pool.execute(query, params)
  : await pool.query(query);
```

---

#### 5. Foreign Key Constraint Violations

**Error:** `Cannot add or update a child row: a foreign key constraint fails`

**Cause:** Trying to insert/update record with invalid foreign key.

**Solution:** Ensure referenced record exists before insertion.

```typescript
// Check if customer exists before creating subscription
const customerExists = await executeMariaDBQuery(
  'SELECT id FROM customer WHERE id = ? AND deleted = 0',
  [customerId]
);

if (customerExists.length === 0) {
  throw new Error('Customer not found');
}

// Now safe to create subscription
```

---

### Error Handling Pattern

```typescript
import { executeMariaDBQuery } from '@/lib/server/mariadb';

async function safeQuery<T>(
  query: string,
  params: any[]
): Promise<{ success: true; data: T[] } | { success: false; error: string }> {
  try {
    const data = await executeMariaDBQuery<T>(query, params);
    return { success: true, data };
  } catch (error) {
    console.error('MariaDB query error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      query: query.substring(0, 200),
      paramCount: params.length,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database query failed',
    };
  }
}

// Usage
const result = await safeQuery<Subscription>(
  'SELECT * FROM subscription WHERE id = ?',
  [subscriptionId]
);

if (!result.success) {
  return NextResponse.json({ error: result.error }, { status: 500 });
}

const subscriptions = result.data;
```

---

## TypeScript Integration

### Type Definitions for Query Results

**Pattern:** Define interfaces matching SELECT columns.

```typescript
// Match SELECT column names exactly
interface SubscriptionWithCustomer {
  subscription_id: number;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  product_name: string;
  date_create: string;  // MariaDB datetime as ISO string
  status: number;
  status_label: 'active' | 'cancel_soft' | 'cancel_forever';
}

const results = await executeMariaDBQuery<SubscriptionWithCustomer>(
  `SELECT
     s.id as subscription_id,
     s.customer_id,
     CONCAT(c.first_name, ' ', c.last_name) as customer_name,
     c.email as customer_email,
     p.product_name,
     s.date_create,
     s.status,
     CASE
       WHEN s.status = 1 THEN 'active'
       WHEN s.status = 4 THEN 'cancel_soft'
       WHEN s.status = 5 THEN 'cancel_forever'
     END as status_label
   FROM subscription s
   INNER JOIN customer c ON s.customer_id = c.id
   INNER JOIN product p ON s.product_id = p.id
   WHERE s.id = ?`,
  [subscriptionId]
);

// TypeScript knows the shape of results[0]
const sub = results[0];
console.log(sub.customer_name);  // ✅ Type-safe
console.log(sub.invalid_field);  // ❌ TypeScript error
```

---

### Null Handling in TypeScript

```typescript
interface CustomerOptional {
  id: number;
  name: string;
  email: string | null;  // May be NULL in database
  country: string | null;
  birthday: string | null;
}

const customer = await executeMariaDBQuery<CustomerOptional>(
  'SELECT id, CONCAT(first_name, " ", last_name) as name, email, country, birthday FROM customer WHERE id = ?',
  [customerId]
);

// Handle nulls safely
const email = customer[0]?.email ?? 'No email provided';
const country = customer[0]?.country ?? 'Unknown';
```

---

### Date Parsing and Formatting

**MariaDB returns dates as strings:**

```typescript
interface SubscriptionDates {
  id: number;
  date_create: string;  // ISO string: "2026-01-28T15:30:00.000Z"
  date_cancel: string | null;
}

const results = await executeMariaDBQuery<SubscriptionDates>(
  'SELECT id, date_create, date_cancel FROM subscription WHERE id = ?',
  [subscriptionId]
);

const sub = results[0];

// Parse to Date object
const createdAt = new Date(sub.date_create);
const cancelledAt = sub.date_cancel ? new Date(sub.date_cancel) : null;

// Format for display
const formattedDate = createdAt.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
```

---

### Enum Mapping

```typescript
// Define enums for database codes
enum SubscriptionStatus {
  Active = 1,
  CancelSoft = 4,
  CancelForever = 5,
}

enum InvoiceType {
  Trial = 1,
  Upsell = 3,
  Refund = 4,
}

// Use in queries
const activeSubscriptions = await executeMariaDBQuery(
  'SELECT * FROM subscription WHERE status = ? AND deleted = 0',
  [SubscriptionStatus.Active]
);

const trials = await executeMariaDBQuery(
  'SELECT * FROM invoice WHERE type = ? AND deleted = 0',
  [InvoiceType.Trial]
);
```

---

## Testing & Verification

### Schema Introspection

```typescript
// Get table schema
const schema = await executeMariaDBQuery(
  'DESCRIBE subscription',
  []
);

console.log('Subscription table columns:', schema);

// Get detailed table structure
const createTable = await executeMariaDBQuery(
  'SHOW CREATE TABLE subscription',
  []
);

console.log(createTable[0]);
```

---

### Data Validation Queries

```typescript
// Check for missing required fields
const invalidCustomers = await executeMariaDBQuery(
  `SELECT
     id,
     email,
     first_name,
     last_name,
     CASE
       WHEN email IS NULL THEN 'missing_email'
       WHEN first_name IS NULL THEN 'missing_first_name'
       WHEN last_name IS NULL THEN 'missing_last_name'
     END as validation_error
   FROM customer
   WHERE (email IS NULL OR first_name IS NULL OR last_name IS NULL)
     AND deleted = 0`,
  []
);

console.log(`Found ${invalidCustomers.length} customers with missing data`);
```

---

### Connection Test Pattern

```typescript
import { testMariaDBConnection, getMariaDBInfo } from '@/lib/server/mariadb';

async function verifyDatabase() {
  console.log('Testing MariaDB connection...');

  const isConnected = await testMariaDBConnection();
  if (!isConnected) {
    throw new Error('Database connection failed');
  }

  const info = await getMariaDBInfo();
  console.log('Database info:', info);
  // Output: { version: '10.5.12-MariaDB', database: 'crm_db', host: 'db.example.com' }
}
```

---

### Verification Scripts

**Example:** Create a script to verify data integrity.

```typescript
// scripts/verify-data.ts
import { executeMariaDBQuery } from '@/lib/server/mariadb';

async function verifyDataIntegrity() {
  // Check for orphaned subscriptions (customer doesn't exist)
  const orphanedSubs = await executeMariaDBQuery(
    `SELECT s.id
     FROM subscription s
     LEFT JOIN customer c ON s.customer_id = c.id
     WHERE c.id IS NULL
       AND s.deleted = 0`,
    []
  );

  console.log(`Orphaned subscriptions: ${orphanedSubs.length}`);

  // Check for subscriptions without trials
  const subsWithoutTrials = await executeMariaDBQuery(
    `SELECT s.id
     FROM subscription s
     LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
     WHERE i.id IS NULL
       AND s.deleted = 0`,
    []
  );

  console.log(`Subscriptions without trials: ${subsWithoutTrials.length}`);
}

verifyDataIntegrity();
```

---

## Data Quality & Cleanup

### 1. Null Handling Patterns

#### COALESCE for Default Values

```typescript
const subscriptionsWithDefaults = await executeMariaDBQuery(
  `SELECT
     s.id,
     COALESCE(sr.source, '(not set)') as source,
     COALESCE(p.product_name, '(not set)') as product_name,
     COALESCE(s.tracking_id, '(no tracking)') as tracking_id,
     COALESCE(s.vat, 0) as vat
   FROM subscription s
   LEFT JOIN source sr ON sr.id = s.source_id
   LEFT JOIN product p ON p.id = s.product_id
   WHERE s.deleted = 0`,
  []
);
```

#### IS NULL vs = NULL

```typescript
// ✅ CORRECT: Use IS NULL
const query1 = `SELECT * FROM subscription WHERE source_id IS NULL`;

// ❌ WRONG: Never use = NULL (always false)
const query2 = `SELECT * FROM subscription WHERE source_id = NULL`;

// Check for NULL or empty string
const query3 = `SELECT * FROM customer WHERE email IS NULL OR email = ''`;
```

#### IFNULL vs COALESCE

```typescript
// IFNULL: Two arguments only
const query1 = `SELECT IFNULL(source_id, 0) FROM subscription`;

// COALESCE: Multiple fallbacks
const query2 = `SELECT COALESCE(tracking_id_5, tracking_id_4, tracking_id_3, '(none)') FROM invoice`;
```

---

### 2. Data Normalization

#### Text Normalization

```typescript
const normalizedCustomers = await executeMariaDBQuery(
  `SELECT
     id,
     UPPER(TRIM(first_name)) as first_name,
     UPPER(TRIM(last_name)) as last_name,
     LOWER(TRIM(email)) as email,
     UPPER(TRIM(country)) as country,
     UPPER(TRIM(place)) as city
   FROM customer
   WHERE deleted = 0`,
  []
);
```

**Always normalize when:**
- Grouping by text fields
- Comparing user input to database
- Displaying in UI with consistent casing

---

#### Case-Insensitive Comparisons

```typescript
// ✅ GOOD: Case-insensitive comparison
const query1 = `
  SELECT * FROM customer
  WHERE LOWER(email) = LOWER(?)
`;

// ✅ BETTER: Use COLLATE for performance
const query2 = `
  SELECT * FROM customer
  WHERE email COLLATE utf8_general_ci = ?
`;
```

---

### 3. Invalid Data Detection

#### Tracking ID Validation

```typescript
const cleanTrackingIds = await executeMariaDBQuery(
  `SELECT
     id,
     tracking_id_1,
     tracking_id_2,
     tracking_id_3,
     tracking_id_4,
     -- Validate tracking_id_5
     CASE
       WHEN tracking_id_5 IS NULL THEN NULL
       WHEN tracking_id_5 = '' THEN NULL
       WHEN tracking_id_5 = 'null' THEN NULL
       WHEN tracking_id_5 LIKE '%funnel%' THEN NULL
       WHEN LENGTH(tracking_id_5) < 20 THEN NULL
       ELSE tracking_id_5
     END as external_click_id,
     -- Flag invalid IDs
     CASE
       WHEN tracking_id_5 = 'null' THEN 'literal_null'
       WHEN tracking_id_5 LIKE '%funnel%' THEN 'funnel_id'
       WHEN LENGTH(tracking_id_5) < 20 THEN 'too_short'
       ELSE 'valid'
     END as id_validation_status
   FROM invoice
   WHERE deleted = 0`,
  []
);
```

#### Empty String vs NULL

```typescript
// Find records with empty strings (should be NULL)
const emptyStrings = await executeMariaDBQuery(
  `SELECT
     id,
     CASE
       WHEN email = '' THEN 'empty_email'
       WHEN tracking_id = '' THEN 'empty_tracking'
       WHEN country = '' THEN 'empty_country'
     END as empty_field
   FROM customer
   WHERE email = '' OR tracking_id = '' OR country = ''`,
  []
);

// Clean up: Convert empty strings to NULL
// (Be cautious with UPDATE queries!)
```

#### String Length Validation

```typescript
// Find suspiciously short/long values
const invalidLengths = await executeMariaDBQuery(
  `SELECT
     id,
     email,
     LENGTH(email) as email_length,
     tracking_id_5,
     LENGTH(tracking_id_5) as tracking_length
   FROM customer
   WHERE LENGTH(email) < 5  -- Too short to be valid
      OR LENGTH(tracking_id_5) < 10  -- Too short
      OR LENGTH(first_name) > 100  -- Suspiciously long`,
  []
);
```

---

### 4. Soft Delete Management

#### Always Filter Soft-Deleted Records

```typescript
// ✅ CORRECT: Always include deleted = 0 filter
const activeRecords = await executeMariaDBQuery(
  `SELECT * FROM subscription
   WHERE date_create BETWEEN ? AND ?
     AND deleted = 0`,  // ← Critical
  [startDate, endDate]
);

// ❌ WRONG: Forgetting to filter deleted
const allRecords = await executeMariaDBQuery(
  `SELECT * FROM subscription
   WHERE date_create BETWEEN ? AND ?`,
  [startDate, endDate]
);
```

#### Include Soft-Deleted (Rare Cases)

```typescript
// When you need to see deleted records
const allIncludingDeleted = await executeMariaDBQuery(
  `SELECT
     *,
     IF(deleted = 1, 'deleted', 'active') as record_status
   FROM subscription
   WHERE id = ?`,
  [subscriptionId]
);
```

---

### 5. Date/Time Cleanup

#### DATE() vs DATETIME Comparisons

```typescript
// ✅ CORRECT: Use DATE() for date-only comparison
const query1 = `
  SELECT * FROM subscription
  WHERE DATE(date_create) = '2026-01-28'
`;

// ✅ CORRECT: Use BETWEEN for datetime range
const query2 = `
  SELECT * FROM subscription
  WHERE date_create BETWEEN '2026-01-28 00:00:00' AND '2026-01-28 23:59:59'
`;

// ❌ SLOW: Using DATE() prevents index usage
// Better to use BETWEEN with full datetime range
```

#### Invalid Date Detection

```typescript
const invalidDates = await executeMariaDBQuery(
  `SELECT
     id,
     birthday,
     YEAR(birthday) as birth_year
   FROM customer
   WHERE birthday IS NOT NULL
     AND (YEAR(birthday) < 1900 OR YEAR(birthday) > YEAR(CURDATE()))`,
  []
);

console.log(`Found ${invalidDates.length} customers with invalid birthdates`);
```

---

### 6. Duplicate Detection

#### Find Duplicate Customers by Email

```typescript
const duplicateEmails = await executeMariaDBQuery(
  `SELECT
     LOWER(TRIM(email)) as email,
     COUNT(*) as customer_count,
     GROUP_CONCAT(id) as customer_ids
   FROM customer
   WHERE email IS NOT NULL
     AND email <> ''
     AND deleted = 0
   GROUP BY LOWER(TRIM(email))
   HAVING COUNT(*) > 1
   ORDER BY customer_count DESC`,
  []
);

console.log(`Found ${duplicateEmails.length} duplicate email addresses`);
```

#### Find Duplicate Subscriptions

```typescript
const duplicateSubs = await executeMariaDBQuery(
  `SELECT
     customer_id,
     product_id,
     DATE(date_create) as subscription_date,
     COUNT(*) as subscription_count,
     GROUP_CONCAT(id) as subscription_ids
   FROM subscription
   WHERE deleted = 0
   GROUP BY customer_id, product_id, DATE(date_create)
   HAVING COUNT(*) > 1`,
  []
);
```

---

### 7. Data Type Validation

#### Email Format Validation

```typescript
const invalidEmails = await executeMariaDBQuery(
  `SELECT
     id,
     email
   FROM customer
   WHERE email IS NOT NULL
     AND email NOT LIKE '%_@_%.__%'  -- Basic email pattern
     AND deleted = 0`,
  []
);
```

#### Numeric Range Validation

```typescript
// Find out-of-range values
const invalidPrices = await executeMariaDBQuery(
  `SELECT
     id,
     trial_price,
     rebill_price
   FROM subscription
   WHERE trial_price < 0
      OR trial_price > 10000
      OR rebill_price < 0
      OR rebill_price > 10000`,
  []
);
```

---

### 8. Validation Queries

#### Count Records with Missing Required Fields

```typescript
const missingDataReport = await executeMariaDBQuery(
  `SELECT
     'customer' as table_name,
     COUNT(CASE WHEN email IS NULL THEN 1 END) as missing_email,
     COUNT(CASE WHEN first_name IS NULL THEN 1 END) as missing_first_name,
     COUNT(CASE WHEN last_name IS NULL THEN 1 END) as missing_last_name,
     COUNT(CASE WHEN country IS NULL THEN 1 END) as missing_country
   FROM customer
   WHERE deleted = 0

   UNION ALL

   SELECT
     'subscription' as table_name,
     COUNT(CASE WHEN customer_id IS NULL THEN 1 END) as missing_customer,
     COUNT(CASE WHEN product_id IS NULL THEN 1 END) as missing_product,
     COUNT(CASE WHEN source_id IS NULL THEN 1 END) as missing_source,
     COUNT(CASE WHEN date_create IS NULL THEN 1 END) as missing_date
   FROM subscription
   WHERE deleted = 0`,
  []
);
```

#### Find Orphaned Records

```typescript
// Subscriptions without customers
const orphanedSubs = await executeMariaDBQuery(
  `SELECT s.id, s.customer_id
   FROM subscription s
   LEFT JOIN customer c ON s.customer_id = c.id
   WHERE c.id IS NULL
     AND s.deleted = 0`,
  []
);

// Invoices without subscriptions
const orphanedInvoices = await executeMariaDBQuery(
  `SELECT i.id, i.subscription_id
   FROM invoice i
   LEFT JOIN subscription s ON i.subscription_id = s.id
   WHERE i.subscription_id IS NOT NULL
     AND s.id IS NULL
     AND i.deleted = 0`,
  []
);
```

---

### 9. Data Migration Patterns

#### Safe UPDATE with Validation

```typescript
// 1. Preview changes first
const previewUpdate = await executeMariaDBQuery(
  `SELECT
     id,
     email,
     LOWER(TRIM(email)) as normalized_email
   FROM customer
   WHERE email IS NOT NULL
     AND email <> LOWER(TRIM(email))
     AND deleted = 0
   LIMIT 10`,
  []
);

console.log('Preview of changes:', previewUpdate);

// 2. Execute update (with WHERE clause to limit scope)
// WARNING: Test on development database first!
/*
await executeMariaDBQuery(
  `UPDATE customer
   SET email = LOWER(TRIM(email))
   WHERE email IS NOT NULL
     AND email <> LOWER(TRIM(email))
     AND deleted = 0`,
  []
);
*/
```

#### Batch Processing Pattern

```typescript
async function batchUpdateCustomers() {
  const batchSize = 100;
  let offset = 0;
  let processedCount = 0;

  while (true) {
    const batch = await executeMariaDBQuery(
      `SELECT id, email FROM customer
       WHERE deleted = 0
       LIMIT ? OFFSET ?`,
      [batchSize, offset]
    );

    if (batch.length === 0) break;

    // Process batch
    for (const customer of batch) {
      // Update logic here
      processedCount++;
    }

    offset += batchSize;
    console.log(`Processed ${processedCount} customers...`);
  }

  console.log(`Total processed: ${processedCount}`);
}
```

---

### 10. Data Cleaning Examples

#### Clean Tracking IDs (from SQL Query)

```typescript
const cleanedData = await executeMariaDBQuery(
  `SELECT
     id,
     -- Remove 'null' strings
     IF(tracking_id = 'null', NULL, tracking_id) as tracking_id_1,
     -- Remove funnel-related IDs
     IF(tracking_id_5 LIKE '%funnel%', NULL, tracking_id_5) as tracking_id_5_clean,
     -- Remove short IDs
     IF(LENGTH(tracking_id_5) < 20, NULL, tracking_id_5) as tracking_id_5_validated
   FROM invoice
   WHERE deleted = 0`,
  []
);
```

#### Normalize Customer Names

```typescript
const normalizedNames = await executeMariaDBQuery(
  `SELECT
     id,
     first_name as original_first_name,
     UPPER(TRIM(first_name)) as normalized_first_name,
     last_name as original_last_name,
     UPPER(TRIM(last_name)) as normalized_last_name,
     CONCAT(UPPER(TRIM(first_name)), ' ', UPPER(TRIM(last_name))) as full_name
   FROM customer
   WHERE deleted = 0`,
  []
);
```

#### Detect Invalid Statuses

```typescript
const invalidStatuses = await executeMariaDBQuery(
  `SELECT
     id,
     status,
     CASE
       WHEN status NOT IN (1, 4, 5) THEN 'invalid_status'
       WHEN status IN (4, 5) AND date_cancel IS NULL THEN 'cancelled_without_date'
       WHEN status = 1 AND date_cancel IS NOT NULL THEN 'active_with_cancel_date'
       ELSE 'valid'
     END as validation_issue
   FROM subscription
   WHERE (status NOT IN (1, 4, 5))
      OR (status IN (4, 5) AND date_cancel IS NULL)
      OR (status = 1 AND date_cancel IS NOT NULL)`,
  []
);
```

---

## Summary

This guide provides comprehensive documentation for working with the MariaDB CRM database, including:

✅ **Full schema reference** for all 9 tables with relationships
✅ **UTM parameter mapping** for Facebook and Google Ads attribution
✅ **Connection patterns** with pooling and error handling
✅ **Query pattern library** for common operations
✅ **20+ real-world use cases** with TypeScript examples
✅ **Advanced patterns** for hierarchical queries and dynamic filtering
✅ **Performance optimization** guidelines
✅ **Error handling** patterns for common issues
✅ **TypeScript integration** with proper type definitions
✅ **Data quality & cleanup** patterns for production data

**Key Takeaways:**

1. **Always use `?` placeholders** (not `$1` like PostgreSQL)
2. **Always filter `deleted = 0`** to exclude soft-deleted records
3. **Normalize text fields** with `UPPER(TRIM())` when grouping/comparing
4. **Use indexed columns** in WHERE clauses for performance
5. **Upsells are linked via `tag` field** containing `parent-sub-id=X`
6. **Approval status:** `is_marked = 1` means approved
7. **Trial conversion:** `invoice_proccessed.date_bought IS NOT NULL`
8. **Customer type:** Compare `date_registered` with `subscription.date_create`
9. **UTM parameters:** `utm_source` → `source` table, `utm_medium` → `tracking_id_1`, `utm_content` → `tracking_id_2`, `utm_term` → `tracking_id_3`, `utm_campaign` → `tracking_id_4`
10. **Click IDs:** Facebook `fbclid` and Google `gclid` stored in `tracking_id_5` (always clean/validate)

---

**Related Documentation:**
- [API Patterns](.claude/docs/api.md) - API routes and PostgreSQL patterns
- [CLAUDE.md](../.claude/CLAUDE.md) - Main project documentation
- [Query Builder](../../lib/server/dashboardDetailQueryBuilder.ts) - Production query examples
