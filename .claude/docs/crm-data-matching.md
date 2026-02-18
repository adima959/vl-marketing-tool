# CRM Data Matching — Reference Values
Purpose: Validate our queries and dashboards against CRM source data.


## Trial counting methodology: Dashboard vs CRM

| Aspect | Dashboard / Marketing Report | CRM External System |
|--------|------------------------------|---------------------|
| **Date source** | `subscription.date_create` | `invoice.invoice_date` (type=1) |
| **Trial unit** | Per subscription (first non-deleted type=1 invoice) | Per invoice (every type=1 invoice) |
| **Re-trials** | Counted once on the original sub creation date | Counted again on the new invoice date |
| **Deleted invoices** | Excluded (`deleted=0` filter) | Excluded |

**Consequence**: Subscriptions that get refunded and re-trialed on a different day appear on different dates in each system. A sub created Jan 1 with a new trial invoice on Feb 16 shows as a Jan 1 trial in our dashboard but a Feb 16 trial in the CRM. Subs with multiple trial invoices on the same day appear as multiple rows in the CRM.

**Typical gap**: ~5-10% of daily trials. Not a bug — different counting methodologies.


## How to compare numbers across views

### CRM Truth "Subscriptions" includes ALL subscription rows
The reference values count every row in the `subscription` table for the given filters.
The dashboard and marketing report split these into **regular subs** and **upsell subs** (`is_upsell_sub`).

**Correct comparison:**
```
CRM Truth Subscriptions = Dashboard Subs + upsell subs (not shown as column)
CRM Truth Trials        = Dashboard Trials + upsell sub trials (not shown)
```

**This is NOT a gap.** Do not report it as a discrepancy.


## Country: Denmark | 2026-09-01 to 2026-09-02
| Customers | Subscriptions | Trials | OTS |
|-----------|---------------|--------|-----|
| 632       | 1,104         | 850    | 46  |


## Country: Denmark | Product: Balansera | 2026-09-01 to 2026-09-02
| Customers | Subscriptions | Trials | OTS |
|-----------|---------------|--------|-----|
| 371       | 500           | 420    | 11  |


## Country: Denmark | Product: Balansera | Network: Adwords | 2026-09-01 to 2026-09-02
| Customers | Subscriptions | Trials | OTS |
|-----------|---------------|--------|-----|
| 290       | 390           | 342    | 0   |


## Country: Denmark | Network: Adwords | 2026-09-01 to 2026-09-02
| Customers | Subscriptions | Trials | OTS |
|-----------|---------------|--------|-----|
| 325       | 578           | 493    | 0   |


## Country: Sweden | 2026-09-01 to 2026-09-02
| Customers | Subscriptions | Trials | OTS |
|-----------|---------------|--------|-----|
| 239       | 593           | 282    | 45  |


## Country: Sweden | 2026-02-08 to 2026-02-12
| Customers | Subscriptions | Trials | OTS |
|-----------|---------------|--------|-----|
| 37        | 73            | 46     | 5   |


## Country: Denmark | 2026-02-08 to 2026-02-12
| Customers | Subscriptions | Trials | OTS |
|-----------|---------------|--------|-----|
| 111       | 163           | 132    | 5   |
