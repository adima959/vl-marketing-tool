# Full Codebase Index

## Routes & Pages
| Route | Purpose |
|---|---|
| `/` | Dashboard — CRM sales, time series, 14-day view |
| `/marketing-report` | Ad spend, clicks, conversions, CRM metrics by dimensions |
| `/on-page-analysis` | Page views, bounce rate, active time, form interactions |
| `/marketing-pipeline` | Kanban board — products, concepts, campaigns, assets |
| `/marketing-pipeline/products` | Product management |
| `/settings/data-maps` | Campaign & URL classification mapping |
| `/settings/permissions` | RBAC role/permission grid |
| `/settings/products` | Product config |
| `/settings/users` | User management |
| `/login`, `/verify` | Auth (OAuth via CRM) |

## API Endpoints (~40)
- **Auth**: callback, config, validate, logout, revoke-user-sessions, sessions/clear
- **Marketing**: /api/marketing/query (flat POST), campaign-classifications
- **On-page**: /api/on-page-analysis/sessions/query (flat POST), detail, url-classifications
- **CRM**: /api/crm/sales, /api/crm/timeseries (MariaDB)
- **Pipeline**: board, messages, campaigns, products, angles, geos, history, translate, users + nested CRUD
- **Settings**: roles, users, saved-views (CRUD + reorder + favorite)
- **Health**: health, heartbeat, verify/postgres, verify/mariadb

## Components (~120 files)
- **marketing-pipeline/** (30) — PipelineBoard, PipelineCard, ConceptDetailPanel, ProductDetailPanel, CampaignModal, ProductAssetsTab, ActivityFeed
- **ui/** (23) — Shadcn primitives + EditableField, NotionEditor, FormRichEditor, SlashCommands
- **settings/** (11) — SettingsShell, GenericMapPanel, CampaignMapPanel, UrlMapPanel, UsersClientTable
- **filters/** (6) — GenericFilterToolbar, FilterPanel, DimensionPicker, DimensionPills, DateRangePicker
- **dashboard/** (5) — DashboardFilterToolbar, DashboardDataTable, DashboardTimeSeriesChart, SaleDetailModal
- **table/** (3) — GenericDataTable (core, server component), DataTable, MetricCell
- **session-analysis/** (4) — SessionFilterToolbar, SessionDimensionPicker, SessionDataTable
- **saved-views/** (3) — SavedViewsDropdown, SaveViewModal, EditViewModal
- **shared/** (2) — LoadDataButton, GenericDimensionPicker
- **auth/** (2) — RouteGuard, LogoutButton

## Stores (Zustand)
| Store | State |
|---|---|
| reportStore | Marketing: dateRange, dimensions, filters, flatData, crmSales, reportData tree |
| dashboardStore | Dashboard: dateRange, dimensions, salesData, reportData, timeSeriesData |
| sessionStore | Session: dateRange, dimensions, filters, flat + hierarchical data |
| pipelineStore | Pipeline: stages, summary, filters, detail panel, campaign performance |
| columnStore | Marketing column visibility (persisted, v5) |
| sessionColumnStore | Session column visibility (persisted, v2) |
| toastStore | Toast notifications |

## Hooks
- **useGenericUrlSync** — core URL ↔ store sync
- **useUrlSync / useSessionUrlSync / useDashboardUrlSync / useOnPageUrlSync / usePipelineUrlSync** — feature wrappers
- **useApplyViewFromUrl** — saved view application from URL
- **useEntityModal** — generic CRUD modal form
- **useActiveHeartbeat** — session keepalive
- **useDragScroll** — horizontal drag scrolling
- **useDebouncedField** — debounced input

## Lib — Server
- **server/db.ts** — Neon Postgres pool ($1,$2)
- **server/mariadb.ts** — MariaDB pool (?)
- **server/marketingQueryBuilder.ts** — flat marketing query
- **server/crmQueryBuilder.ts** — MariaDB CRM (3 parallel queries)
- **server/sessionQueryBuilder.ts** — flat session query (entry + funnel modes)
- **server/onPageQueryBuilder.ts** — on-page detail (materialized view)
- **server/crmFilters.ts** — trial eligibility, upsell tagging, marketing match
- **server/dbErrorClassifier.ts** — unified error classification
- **server/googleDrive.ts** — Google Drive for assets

## Lib — Client/Shared
- **api/createApiClient.ts** — typed POST client factory
- **utils/treeUtils.ts** — tree ops for hierarchical tables
- **utils/marketingTree.ts / sessionTree.ts** — tree building from flat data
- **utils/salesAggregation.ts** — hierarchical aggregation
- **utils/csvExport.ts** — batch pagination + CSV download
- **formatters.ts** — number/percentage/currency/time
- **savedViews.ts** — date preset resolution
- **schemas/api.ts** — Zod request validation
- **auth.ts** — session management, permission map
- **rbac.ts** — withRole, withAuth, withAdmin HOFs

## Types
- **report.ts** — ReportRow (hierarchical, ad spend + CRM metrics)
- **sales.ts** — SaleRow (flat, subscription/OTS/upsell)
- **sessionReport.ts** — SessionReportRow (page views, bounce, active time)
- **marketing-pipeline.ts** — PipelineStage, ProductStatus, AngleStatus, Channel enums
- **dimensions.ts** — Dimension interface, DimensionGroup (14 groups)
- **metrics.ts** — MetricColumn (format, tooltip, width)
- **filters.ts** — TableFilter, FilterOperator
- **savedViews.ts** — SavedView, ResolvedViewParams
- **roles.ts** — FeatureKey, PermissionAction

## Config
- **columns.ts** — marketing report metrics
- **dashboardColumns.ts** — dashboard CRM metrics
- **sessionColumns.ts** — session engagement metrics
- **marketingDimensions.ts** — ad network hierarchy + classifications
- **dashboardDimensions.ts** — CRM sales dimensions
- **onPageDimensions.ts** — content, source, audience, time
- **sessionDimensions.ts** — entry-point tracking
- **settings.ts** — settings pages + permission gates

## Scripts
- 10+ SQL migration scripts (schema changes, indexes, materialized views)
- 18+ debug scripts (CRM data mismatches, trial counts, attribution gaps)
- Utility scripts (heartbeat usage, schema checks, column adds)

## Styles
- **tokens.ts / tokens.css** — design tokens (colors, spacing, typography)
- **theme.ts** — Ant Design theme overrides
- CSS Modules: tables (base + per-report themes), components (dropdown, modal, badge, settings)
