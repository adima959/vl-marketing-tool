# CRM Data Matching — Reference Values
Purpose: Validate our queries and dashboards against CRM source data.


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
