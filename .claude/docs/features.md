# Feature Documentation

Feature-specific implementations.

## New Orders Dashboard

**Purpose**: Track daily subscription conversions from MariaDB CRM data
**Hierarchy**: Country → Product → Source (3 levels)
**Metrics**: Subscriptions (active), OTS (one-time sales), Trials (approved), Customers (unique)
**Default**: Date filter defaults to today only
**Data**: MariaDB tables (subscription, invoice, customer, product, source)

See full query patterns, metrics calculation logic, and implementation details in original documentation or ask for specifics.
