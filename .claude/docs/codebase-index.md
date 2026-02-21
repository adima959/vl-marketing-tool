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

## Components (~130 files)
- **marketing-pipeline/** (35) — PipelineBoard, PipelineCard, ConceptDetailPanel, ProductDetailPanel, CampaignModal, ProductAssetsTab, ActivityFeed, CampaignDetailContent, CampaignHierarchySection, GeoTracksSection, StrategyCopyTab, CopyVariationsSection, VersionHistorySection, CpaHealthTooltip, CreativeModal, AssetModal, AssetTypeIcon
- **ui/** (23) — Shadcn primitives + EditableField, EditableHeader, EditableSelect, EditableTags, RichEditableField, NotionEditor, FormRichEditor, SlashCommands, ToggleBlock, SidebarModal, GenericStatusBadge, TableInfoBanner
- **settings/** (11) — SettingsShell, SettingsPageWrapper, SettingsNav, GenericMapPanel, CampaignMapPanel, UrlMapPanel, AffiliateMapPanel, AngleMapPanel, UsersClientTable, ProductsClientTable, ProductDialog
- **filters/** (6) — GenericFilterToolbar, FilterPanel, DimensionPicker, DimensionPills, DateRangePicker, FilterToolbar
- **dashboard/** (5) — DashboardFilterToolbar, DashboardDataTable, DashboardTimeSeriesChart, SaleDetailModal
- **table/** (3) — GenericDataTable (core), DataTable (marketing-specific), MetricCell
- **session-analysis/** (4) — SessionFilterToolbar, SessionDimensionPicker, SessionDataTable, SessionColumnSettingsModal
- **saved-views/** (3) — SavedViewsDropdown, SaveViewModal, EditViewModal
- **shared/** (2) — LoadDataButton, GenericDimensionPicker
- **on-page-analysis/** (2) — onPageViewColumns, OnPageViewsModal
- **modals/** (2) — ColumnSettingsModal, GenericColumnSettingsModal
- **auth/** (2) — RouteGuard, LogoutButton
- **layout/** (1) — PageHeader
- **loading/** (1) — TableSkeleton
- **notifications/** (1) — Toast
- **users/** (1) — EditRoleDialog

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
- **useGenericUrlSync** — core URL ↔ store sync (nuqs-based)
- **useUrlSync** — marketing report URL sync wrapper
- **useSessionUrlSync** — session analytics URL sync wrapper
- **useDashboardUrlSync** — dashboard URL sync wrapper
- **usePipelineUrlSync** — pipeline URL sync (product/concept/stage)
- **useReportPageSetup** — shared page setup: date range resolution, apply-view callback factory
- **useApplyViewFromUrl** — reads `?viewId=`, fetches saved view, applies params
- **useEntityModal** — generic CRUD modal form (open/close, form instance, callback)
- **useToast** — convenience wrapper for toastStore
- **useActiveHeartbeat** — session keepalive (30s POST, 60s idle stop)
- **useDragScroll** — click-and-drag horizontal scrolling on tables
- **useDebouncedField** — per-field debounced update
- **useToggleSet** — Set<string> with toggle semantics (expand/collapse)
- **use-mobile** — mobile viewport detection via matchMedia

## Lib — Server (`lib/server/`)
- **db.ts** — Neon Postgres pool ($1,$2), lazy init, error classification
- **mariadb.ts** — MariaDB pool (?), error classification
- **marketingQueryBuilder.ts** — flat marketing query with dimension/filter mapping
- **crmQueryBuilder.ts** — MariaDB CRM (3 parallel queries: subscriptions + OTS + upsells)
- **sessionQueryBuilder.ts** — flat session query (entry + funnel modes)
- **onPageQueryBuilder.ts** — on-page detail (materialized view)
- **crmFilters.ts** — trial eligibility, upsell tagging, marketing match WHERE clauses
- **apiErrorHandler.ts** — standardized API error responses (Zod, server) into JSON envelopes
- **dbErrorClassifier.ts** — config-driven error classifier (Postgres + MariaDB error codes → AppError)
- **caseUtils.ts** — toCamelCase / rowsToCamelCase for DB snake_case conversion
- **debugLogger.ts** — file logger appending to debug.log (dev only)
- **googleDrive.ts** — Google Drive client via Service Account JWT (no googleapis dep)
- **types.ts** — QueryOptions, sort direction validation

## Lib — API Clients (`lib/api/`)
- **createApiClient.ts** — factory for typed fetch clients (createQueryClient, createDetailClient)
- **crmClient.ts** — fetchCRMSales, fetchCRMTimeseries
- **marketingClient.ts** — fetchMarketingDataFlat
- **sessionClient.ts** — fetchSessionDataFlat
- **savedViewsClient.ts** — saved views CRUD
- **onPageDetailsClient.ts** — queryOnPageDetails
- **campaignClassificationsClient.ts** — campaign classification mappings CRUD
- **urlClassificationsClient.ts** — URL classification mappings CRUD
- **errorHandler.ts** — global error callback registry (triggerError, clearError, isAuthError)

## Lib — Marketing Pipeline (`lib/marketing-pipeline/`)
- **db.ts** — all Postgres CRUD for pipeline entities (products, angles, messages, campaigns, geos, assets, creatives)
- **historyService.ts** — audit log: field-level change records
- **cpaUtils.ts** — CPA target lookup, color coding, board summary
- **campaignPerformance.ts** — live performance data from Ads + CRM + On-page in parallel
- **formatters.ts** — fmtNumber (1.2M / 4.5k), fmtDuration
- **getChangedBy.ts** — extracts requesting user ID for history

## Lib — Utils (`lib/utils/`)
- **marketingTree.ts** — buildMarketingTree + attachCrmMetrics
- **sessionTree.ts** — buildSessionTree
- **salesAggregation.ts** — flat SaleRow → DashboardRow + DailyAggregate
- **saleRowFilters.ts** — metric-specific SaleRow filters (mirrors server-side count logic)
- **classificationMatching.ts** — country-code detection from campaign names/URL segments
- **networkMapping.ts** — network names → utm_source mapping
- **onPageLink.ts** — on-page analysis deep-link URL builder
- **treeUtils.ts** — generic tree: findRow, updateRow, restoreExpandedRows
- **tableUtils.ts** — injectSkeletonRows for hierarchical tables
- **dynamicUpdate.ts** — buildDynamicSetClauses for partial Postgres UPDATEs
- **displayFormatters.ts** — formatTimeAgo, date formatters for pipeline
- **csvExport.ts** — batched CSV export with cancellation (ExportCancelledError)
- **chartDateUtils.ts** — getLast14DaysRange, date fill for time-series charts
- **validation.ts** — isValidUUID, isValidDriveId

## Lib — Other
- **types/api.ts** — DateRange, QueryParams, formatLocalDate
- **types/errors.ts** — AppError, ErrorCode enum, normalizeError, maskErrorForClient
- **schemas/api.ts** — Zod schemas for API request validation
- **schemas/marketingPipeline.ts** — Zod schemas for pipeline entity CRUD
- **security/timing-safe-compare.ts** — timingSafeEqual for timing attack prevention
- **roles/db.ts** — Postgres CRUD for roles and role permissions
- **auth.ts** — session management: validateTokenWithCRM, saveSessionToDatabase, setAuthCookie, validateRequest
- **rbac.ts** — withPermission middleware, getUserFromRequest, getUserByExternalId
- **formatters.ts** — toTitleCase, formatNumber, formatPercentage, formatCurrency, formatMetric
- **savedViews.ts** — resolveViewParams (presets → absolute dates), date preset labels
- **sanitize.ts** — DOMPurify-based HTML sanitizer for TipTap content
- **utils.ts** — cn() Tailwind class merge (clsx + tailwind-merge)

## Contexts
- **AuthContext.tsx** — AuthProvider + useAuth: current user, permissions, login redirect, global error display

## Types
- **index.ts** — re-exports metrics, dimensions, report, marketing-pipeline
- **report.ts** — ReportRow (hierarchical, ad spend + CRM metrics)
- **sales.ts** — SaleRow, SalesDimension, DashboardRow, DailyAggregate, DIMENSION_TO_FIELD
- **sessionReport.ts** — SessionReportRow (page views, bounce, active time)
- **marketing-pipeline.ts** — PipelineStage, ProductStatus, AngleStatus, Channel, Product, Angle, Message, Campaign, Geography, Asset, Creative, GeoStage
- **dimensions.ts** — Dimension, DimensionGroup, DimensionGroupConfig
- **metrics.ts** — MetricColumn, MetricFormat
- **filters.ts** — TableFilter, FilterOperator
- **savedViews.ts** — SavedView, DatePreset, DateMode, ResolvedViewParams
- **auth.ts** — PermissionMap, CRMUser, AuthValidationResponse
- **user.ts** — UserRole enum, AppUser
- **roles.ts** — FeatureKey, PermissionAction, Role, RolePermission, RoleWithPermissions, FEATURES
- **table.ts** — MetricClickContext, column render helper types
- **onPageDetails.ts** — OnPageViewClickContext, OnPageDetailRecord, OnPageDetailRequest

## Config
- **columns.ts** — METRIC_COLUMNS for marketing report
- **dashboardColumns.ts** — DASHBOARD_METRIC_COLUMNS for dashboard
- **sessionColumns.ts** — SESSION_METRIC_COLUMNS for session analytics
- **marketingDimensions.ts** — MARKETING_DIMENSION_GROUPS (advertising, geo, time, classification)
- **dashboardDimensions.ts** — DASHBOARD_DIMENSION_GROUPS (sales dimensions)
- **onPageDimensions.ts** — ON_PAGE_DIMENSION_GROUPS (content, source, audience, device)
- **sessionDimensions.ts** — SESSION_DIMENSION_GROUPS, SESSION_DIMENSION_VALID_KEYS
- **settings.ts** — SETTINGS_PAGES (routes, icons, permission gates)

## Scripts
- **analyze-tracker.ts** — audit tracker views and schema
- **run-migration-rename.ts** — run rename-tracker-views.sql migration
- **add-assets-column.ts** — migration: add assets column to pipeline tables
- **drop-campaign-status.ts** — drop deprecated campaign_status column
- **find-campaign-status.ts** — find remaining campaign_status usages
- **heartbeat-usage-per-user.ts** — query heartbeat table for active time per user
- **check-ads-schema.ts** — inspect ads spending table schema
- **verify-crm-cohorts.ts** — verify CRM cohort count consistency
- **debug-*.ts** (~15) — CRM matching, trial counts, attribution gap investigations
- **migrations/rename-tracker-views.sql** — rename tracker DB views

## Styles
- **tokens.ts / tokens.css** — design tokens (colors, spacing, typography) — source of truth
- **theme.ts** — Ant Design ThemeConfig mapping tokens to component overrides
- **tables/base.module.css** — base table styles shared by all themes
- **tables/sticky.module.css** — sticky column/header styles
- **tables/themes/** — dashboard, marketing, onPage, session table themes
- **components/** — modal, badge, dropdown, settings CSS modules

## Top-Level Files
- **next.config.js** — Ant Design transpile, bundle analyzer, compression, image domains
- **tailwind.config.ts** — shadcn/ui CSS variable color system
- **tsconfig.json** — `@/` path alias, strict mode
- **docker-compose.yaml** — local dev container
- **Dockerfile** / **Dockerfile.debian** / **Dockerfile.simple** — deploy variants
- **deploy.sh** — deployment script
