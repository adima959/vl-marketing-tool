# Feature Documentation

Feature-specific implementations and configurations.

## Table of Contents

1. [Marketing Report Dashboard](#marketing-report-dashboard)
2. [On-Page Analysis Dashboard](#on-page-analysis-dashboard)
3. [Marketing Tracker](#marketing-tracker)
4. [Users Management](#users-management)

---

## Marketing Report Dashboard

**Route**: `/marketing-report`
**Purpose**: Analyze ad campaign performance across dimensions (campaigns, ad groups, keywords, dates)
**Data Source**: PostgreSQL (Neon) - `campaign_data` table

### Configuration

**Dimensions** (`types/dimensions.ts`):
- Campaign
- Ad Group
- Keyword
- Date

**Metrics** (`config/columns.ts`):
- **Marketing Data**: Clicks, Impressions, CTR, CPC, Cost
- **CRM Data**: Conversions, Revenue, ROAS, AOV

**Default State**:
- Date range: Last 30 days
- Dimensions: `['campaign']`
- Sort: By clicks (descending)
- Visible columns: All default visible columns

### Components

| Component | File | Purpose |
|-----------|------|---------|
| Page | `app/marketing-report/page.tsx` | Main page with URL sync |
| Table | `components/table/DataTable.tsx` | Wrapper around GenericDataTable |
| Filters | `components/filters/FilterToolbar.tsx` | Dimension pills + date picker |
| Store | `stores/reportStore.ts` | Data, filters, loading state |
| Column Store | `stores/columnStore.ts` | Column visibility/order |
| URL Sync | `hooks/useUrlSync.ts` | Wrapper around useGenericUrlSync |
| API | `app/api/marketing/query/route.ts` | Query endpoint |
| Query Builder | `lib/server/marketingQueryBuilder.ts` | SQL generation |

### Hierarchy Pattern

**Example**: Campaign → Ad Group → Keyword
```
▼ Google Ads (Campaign)
  ▼ Brand Campaign (Ad Group)
    → seo services (Keyword)
    → web design (Keyword)
  ▶ Generic Campaign (Ad Group)
▼ Facebook Ads (Campaign)
```

**Depth calculation**:
- Campaign: depth 0
- Ad Group: depth 1
- Keyword: depth 2

---

## On-Page Analysis Dashboard

**Route**: `/on-page-analysis`
**Purpose**: Analyze website visitor behavior by URL, referrer, device, and date
**Data Source**: PostgreSQL (Neon) - `on_page_events` table

### Configuration

**Dimensions** (`types/dimensions.ts`):
- URL
- Referrer
- Device Type
- Date

**Metrics** (`config/onPageColumns.ts`):
- **Engagement**: Page Views, Unique Visitors, Bounce Rate, Avg Active Time
- **Interactions**: Scroll Past Hero, Scroll Rate, Form Views, Form View Rate, Form Starters, Form Start Rate

**Default State**:
- Date range: Last 7 days
- Dimensions: `['url']`
- Sort: By pageViews (descending)
- Visible columns: All engagement + key interaction metrics

### Components

| Component | File | Purpose |
|-----------|------|---------|
| Page | `app/on-page-analysis/page.tsx` | Main page with URL sync |
| Table | `components/on-page-analysis/OnPageDataTable.tsx` | Wrapper around GenericDataTable |
| Filters | `components/on-page-analysis/OnPageFilterToolbar.tsx` | Dimension pills + date picker |
| Store | `stores/onPageStore.ts` | Data, filters, loading state |
| Column Store | `stores/onPageColumnStore.ts` | Column visibility/order |
| URL Sync | `hooks/useOnPageUrlSync.ts` | Wrapper around useGenericUrlSync |
| API | `app/api/on-page-analysis/query/route.ts` | Query endpoint |
| Query Builder | `lib/server/onPageQueryBuilder.ts` | SQL generation |

### Unique Features

**Tooltips**: Column headers show info icons with metric descriptions (enabled via `showColumnTooltips={true}`)

**Calculated Metrics**:
- Bounce Rate: `(bounces / pageViews) * 100`
- Scroll Rate: `(scrollPastHero / pageViews) * 100`
- Form View Rate: `(formViews / pageViews) * 100`
- Form Start Rate: `(formStarters / formViews) * 100`

**Color Scheme**: Green-based (`#e6f7ed` for expanded rows) vs blue-based in Marketing Report

---

## Marketing Tracker

**Route**: `/marketing-tracker`
**Purpose**: Track marketing campaign performance by angle, product, and sub-angle
**Data Source**: MariaDB - Multiple tables (campaigns, products, angles, etc.)

### Structure

**Pages**:
- Main: `/marketing-tracker` - Overview dashboard
- Angle Detail: `/marketing-tracker/angle/[angleId]` - Specific angle analytics
- Product Detail: `/marketing-tracker/product/[productId]` - Product performance
- Sub-Angle Detail: `/marketing-tracker/sub-angle/[subAngleId]` - Sub-angle breakdown

### Configuration

**Data Sources**:
- MariaDB tables: campaigns, products, angles, sub_angles, tracking_data
- Uses `executeMariaDBQuery` from `lib/server/mariadb.ts`
- Placeholder syntax: `?` (not `$1`)

### Components

| Component | File | Purpose |
|-----------|------|---------|
| Main Page | `app/marketing-tracker/page.tsx` | Dashboard overview |
| Angle Detail | `app/marketing-tracker/angle/[angleId]/page.tsx` | Angle-specific view |
| Product Detail | `app/marketing-tracker/product/[productId]/page.tsx` | Product-specific view |
| Sub-Angle Detail | `app/marketing-tracker/sub-angle/[subAngleId]/page.tsx` | Sub-angle view |

### Auth System

- HTTP-only cookies with `crm_auth_token`
- `getUserFromRequest` from `@/lib/rbac` returns `AppUser` with `id` (UUID), `name`, `email`, `role`

### History Service

- `SKIP_FIELDS` set prevents derived/computed fields from generating duplicate history entries
- `DERIVED_FIELD_NAMES` array used in SQL `WHERE NOT IN` clause to filter old data from queries
- `getChangedBy` helper in `lib/marketing-tracker/getChangedBy.ts` extracts user ID from auth cookie

### API Routes

**Pattern**: `/api/marketing-tracker/[resource]/[id]`

Example routes (based on page structure):
- Angles: `/api/marketing-tracker/angles`
- Products: `/api/marketing-tracker/products`
- Messages: `/api/marketing-tracker/messages`

---

## Users Management

**Route**: `/users`
**Purpose**: Manage user accounts and permissions
**Data Source**: PostgreSQL (Neon) - `users` table (assumed)

### Configuration

**Status**: Basic CRUD operations for user management

### Components

| Component | File | Purpose |
|-----------|------|---------|
| Page | `app/users/page.tsx` | User list and management interface |

**Note**: Implementation details not fully documented. See actual component files for specifics.

---

## Feature Comparison Matrix

| Feature | Data Source | Hierarchy | URL Sync | Generic Components | Tooltips |
|---------|-------------|-----------|----------|-------------------|----------|
| Marketing Report | PostgreSQL | 4 levels | ✅ | ✅ GenericDataTable + useGenericUrlSync | ❌ |
| On-Page Analysis | PostgreSQL | 4 levels | ✅ | ✅ GenericDataTable + useGenericUrlSync | ✅ |
| Marketing Tracker | MariaDB | Custom | ❌ | ❌ | ❌ |
| Users | PostgreSQL | None | ❌ | ❌ | ❌ |

---

## Adding New Features

> **Workflow guide**: See `docs/workflows/new-feature-checklist.md` (similarity scoring, path selection).
> For implementation patterns, read existing source files directly — AI derives patterns from similar components in the codebase.

---

## Feature Deprecation

**If removing a feature**:
1. Delete route directory: `app/[feature]/`
2. Delete related API routes: `app/api/[feature]/`
3. Delete store: `stores/[feature]Store.ts`
4. Delete components: `components/[feature]/`
5. Update navigation/sidebar if applicable
6. Update this documentation

---

## Known Limitations

### Marketing Report & On-Page Analysis
- No virtualization (performance degrades with 1000+ rows)
- No custom metrics/calculations

### Marketing Tracker
- Not using generic components (potential duplication)
- No URL state sync (not shareable)

### Users
- No audit log
