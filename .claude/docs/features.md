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
| API | `app/api/reports/query/route.ts` | Query endpoint |
| Query Builder | `lib/server/queryBuilder.ts` | SQL generation |

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

### API Routes

**Pattern**: `/api/marketing-tracker/[resource]/[id]`

Example routes (based on page structure):
- Angles: `/api/marketing-tracker/angles`
- Products: `/api/marketing-tracker/products`
- Sub-angles: `/api/marketing-tracker/sub-angles`

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

### Complete Workflow (All Features)

Follow this workflow regardless of feature type. Use GenericDataTable patterns for hierarchical reports.

**Step 1: Plan & Design**
1. **Check if similar feature exists:**
   ```bash
   # Search for similar patterns
   grep -r "similar pattern" components/
   find . -name "*Report*" -o -name "*Analysis*"
   ```
2. **Decide architecture:**
   - Hierarchical data? → Use GenericDataTable + useGenericUrlSync
   - Custom UI? → Build standalone with Ant Design + CSS Modules
3. **Write plan if complex:**
   - Create plan in `.claude/plans/` if feature touches >3 files
   - Document architectural decisions
4. **Get user approval before coding**

**Step 2: Implement**

*For hierarchical dashboards (GenericDataTable pattern):*
1. **Create types** (`types/myReport.ts`):
   ```typescript
   export interface MyReportRow extends BaseTableRow {
     key: string;
     attribute: string;
     depth: number;
     hasChildren?: boolean;
     metrics: { metric1: number; metric2: number };
   }
   ```
2. **Create column config** (`config/myColumns.ts`):
   - Define `METRIC_COLUMNS` array
   - Define `COLUMN_GROUPS` array
3. **Create store** (`stores/myStore.ts`):
   - Copy `reportStore.ts` or `onPageStore.ts` pattern
   - Customize domain-specific logic only
4. **Create API route** (`app/api/my-report/query/route.ts`):
   - POST handler accepting `{ dimensions, dateRange, parentKey }`
   - Return `{ success: true, data: [...] }`
5. **Create wrapper components:**
   - `components/my-report/MyDataTable.tsx` - Wrapper around GenericDataTable
   - `components/my-report/MyFilterToolbar.tsx` - Filters (optional if custom needed)
6. **Create page** (`app/my-report/page.tsx`):
   - Use `useMyUrlSync()` hook
   - Render DataTable + FilterToolbar
7. **Test with real data:**
   - Large numbers, dates, long text
   - Deep hierarchies (3+ levels)

*For custom features (non-hierarchical):*
1. Create page in `app/[feature]/page.tsx`
2. Build custom components in `components/[feature]/`
3. Create API routes as needed in `app/api/[feature]/`
4. Use Ant Design + CSS Modules for styling

**Step 3: Document**

1. **Add section to features.md** (this file):
   - Feature name, route, purpose
   - Data source (PostgreSQL/MariaDB)
   - Configuration (dimensions, metrics, default state)
   - Component table
   - Unique features (if any)
2. **Update CLAUDE.md** if new pattern introduced:
   - Add to Table of Contents
   - Document in Key Patterns section
3. **Update api.md** if new API pattern:
   - Document query builder logic
   - Add example queries
4. **Update design.md** if new UI pattern:
   - Document visual patterns
   - Add color schemes
5. **Update this features.md section** with any learnings

**Step 4: Verify**

1. **Build check:**
   ```bash
   npm run build
   ```
   - Fix any TypeScript errors
   - Verify no import cycles
2. **Browser test:**
   ```bash
   npm run dev
   ```
   - Test all interactions (expand, sort, filter, load)
   - Verify metrics calculate correctly
3. **URL sync verification:**
   - Change filters → verify URL updates
   - Copy URL → paste in new tab → verify state restores
   - Test expanded rows persist in URL
4. **Persistence verification:**
   - Toggle column visibility
   - Refresh page
   - Verify columns stay hidden/visible (localStorage)

**Step 5: Commit & PR**

1. **Commit code + docs together:**
   ```bash
   git add .
   git commit -m "feat: Add [feature name]

   - Implemented [key functionality]
   - Added [components/stores/APIs]
   - Updated documentation

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
   ```
2. **Create PR with summary:**
   ```bash
   gh pr create --title "feat: [Feature Name]" --body "$(cat <<'EOF'
   ## Summary
   - Implemented [feature] with [key details]
   - Uses GenericDataTable pattern (or: Custom implementation)
   - [Key metric/benefit]

   ## Test plan
   - [ ] Build passes without errors
   - [ ] All interactions work (expand, sort, filter)
   - [ ] URL sync works (shareable links)
   - [ ] Column persistence works across reloads

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```
3. **Include screenshots** if UI change:
   - Before/after comparisons
   - Key features highlighted

**Common Pitfalls:**
- ❌ Forgetting to update documentation
- ❌ Not testing with large datasets
- ❌ Hardcoding colors/spacing (use design tokens)
- ❌ Not verifying URL sync and persistence
- ❌ Creating new patterns when generics would work

---

### Dashboard with Hierarchical Data

**When**: Need report-style view with drill-down, filters, metrics

**Follow**: Marketing Report or On-Page Analysis pattern

**Steps**:
1. Copy feature structure (see "Build New Dashboard/Report Page" in CLAUDE.md)
2. Use GenericDataTable + useGenericUrlSync
3. Create store following reportStore pattern
4. Create API route following `/api/reports/query` pattern
5. Define metrics in `config/`
6. Define dimensions in `types/`

**Time**: ~2-3 hours

---

### Non-Hierarchical Feature

**When**: Custom UI, not report-style

**Follow**: Marketing Tracker or Users pattern

**Steps**:
1. Create page in `app/[feature]/page.tsx`
2. Build custom components (don't use generics)
3. Create API routes as needed
4. Use Ant Design + CSS Modules for UI

**Time**: Varies by complexity

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
- No export functionality (CSV, Excel)
- No saved views/bookmarks (URL only)
- No custom metrics/calculations

### Marketing Tracker
- Not using generic components (potential duplication)
- No URL state sync (not shareable)
- Limited documentation

### Users
- Basic implementation only
- No RBAC (role-based access control) UI
- No audit log
