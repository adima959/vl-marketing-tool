/**
 * Unified tracker query builder.
 *
 * Single source of truth for all on-page analytics queries.
 * Queries the raw tracker_* tables in neondb directly (no views).
 *
 * Exports:
 *   getTrackerDataFlat()          — replaces sessionQueryBuilder.buildFlatQuery()
 *   getTrackerDetail()            — replaces onPageQueryBuilder.buildDetailQuery()
 *   getTrackerMetricsByCampaign() — replaces fetchOnPageMetrics() in campaignPerformance
 *   getTrackerAdLandingPages()    — replaces fetchAdLandingPages()
 *   getTrackerFunnelFluxIds()     — replaces fetchFunnelFluxIds()
 */

import { executeQuery } from '@/lib/server/db';
import { formatLocalDate } from '@/lib/types/api';

type SqlParam = string | number | boolean | null;
type FilterOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains';

// ── Shared SQL fragments ─────────────────────────────────────────────

/**
 * Base FROM clause: page_views JOIN sessions + LATERAL heartbeats + LATERAL events.
 * `pvTable` is either "tracker_page_views" or "entry_pv" (CTE alias for entry mode).
 */
function buildBaseFrom(pvTable: string): string {
  return `
    FROM ${pvTable} pv
    JOIN tracker_sessions s ON pv.session_id = s.session_id
    LEFT JOIN LATERAL (
      SELECT MAX(cumulative_active_ms) AS cumulative_active_ms
      FROM tracker_raw_heartbeats rh
      WHERE rh.page_view_id = pv.page_view_id
    ) hb ON true
    LEFT JOIN LATERAL (
      SELECT
        MAX((e.event_properties->>'scroll_percent')::int)
          FILTER (WHERE e.event_name = 'page_scroll') AS scroll_percent,
        bool_or(e.event_name = 'element_signal' AND e.signal_id IN ('hero-section','hero') AND e.action = 'out_view') AS hero_scroll_passed,
        bool_or(e.event_name = 'form' AND e.action = 'visible') AS form_view,
        bool_or(e.event_name = 'form' AND e.action = 'started') AS form_started,
        bool_or(e.event_name = 'element_signal' AND e.signal_id LIKE 'CTA-%' AND e.action = 'in_view') AS cta_viewed,
        bool_or(e.event_name = 'element_signal' AND e.signal_id LIKE 'CTA-%' AND e.action = 'click') AS cta_clicked,
        COUNT(*) FILTER (WHERE e.event_name = 'form' AND e.action = 'errors') AS form_errors,
        (array_agg(e.event_properties) FILTER (WHERE e.event_name = 'form' AND e.action = 'errors'))[1] AS form_errors_detail
      FROM tracker_events e
      WHERE e.page_view_id = pv.page_view_id
    ) ev ON true`;
}

/** Computed active_time_s expression (heartbeat fallback) */
const ACTIVE_TIME_EXPR = 'COALESCE(pv.time_on_page_final_ms / 1000.0, hb.cumulative_active_ms / 1000.0)';

/** CTE for entry mode: first page view per session */
const ENTRY_CTE = `
  WITH entry_pv AS (
    SELECT DISTINCT ON (session_id) *
    FROM tracker_page_views
    ORDER BY session_id, viewed_at ASC
  )`;

// ── Dimension maps ───────────────────────────────────────────────────

/**
 * Entry-mode dimensions: one row per session (first page view).
 * Maps frontend dimension IDs → SQL expressions using entry_pv/session aliases.
 */
/** Bot score CASE expression (bucketed) */
const BOT_SCORE_CASE = (prefix: string): string =>
  "CASE WHEN " + prefix + ".bot_score >= 0.8 THEN 'High Risk' WHEN " + prefix + ".bot_score >= 0.5 THEN 'Medium Risk' WHEN " + prefix + ".bot_score IS NOT NULL THEN 'Low Risk' ELSE 'Unknown' END";

/** Product COALESCE expression (requires product JOIN) */
const PRODUCT_EXPR = "COALESCE(ap.name, 'Unclassified')";

/** Strip protocol from url_path for consistent display */
const CLEAN_URL = (col: string): string => "REGEXP_REPLACE(" + col + ", '^https?://', '')";

const ENTRY_DIMENSION_MAP: Record<string, string> = {
  entryUrlPath: CLEAN_URL('pv.url_path'),
  entryPageType: 'pv.page_type',
  entryProduct: PRODUCT_EXPR,
  entryUtmSource: 's.utm_source',
  entryCampaign: 's.utm_campaign',
  entryAdset: 's.utm_content',
  entryAd: 's.utm_medium',
  entryWebmasterId: 's.utm_medium',
  entryUtmTerm: 's.utm_term',
  entryKeyword: 's.keyword',
  entryPlacement: 's.placement',
  entryReferrer: 's.refferer',
  funnelId: 's.ff_funnel_id',
  entryCountryCode: 's.country_code',
  entryDeviceType: 's.device_type',
  entryOsName: 's.os_name',
  entryBrowserName: 's.browser_name',
  entryBotScore: BOT_SCORE_CASE('s'),
  visitNumber: 'DENSE_RANK() OVER (PARTITION BY s.visitor_id ORDER BY s.created_at)',
  date: 's.created_at::date',
};

/** All-page-view mode dimensions (every page view, not just entry) */
const PAGE_VIEW_DIMENSION_MAP: Record<string, string> = {
  urlPath: CLEAN_URL('pv.url_path'),
  pageType: 'pv.page_type',
  utmSource: 's.utm_source',
  campaign: 's.utm_campaign',
  adset: 's.utm_content',
  ad: 's.utm_medium',
  funnelId: 's.ff_funnel_id',
  countryCode: 's.country_code',
  deviceType: 's.device_type',
  osName: 's.os_name',
  browserName: 's.browser_name',
  visitNumber: 'DENSE_RANK() OVER (PARTITION BY s.visitor_id ORDER BY s.created_at)',
  date: 'pv.viewed_at::date',
};

/**
 * Funnel-mode dimensions.
 * Entry-level dims reference the CTE ms.* alias, funnelStep uses pv.url_path.
 */
const FUNNEL_DIMENSION_MAP: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(ENTRY_DIMENSION_MAP).map(([k, v]) => [k, v.replace(/^(pv\.|s\.)/, 'ms.')])
  ),
  funnelStep: "REGEXP_REPLACE(pv.url_path, '^https?://', '')",
  date: 'pv.viewed_at::date',
  // Override visitNumber for funnel mode — already computed in CTE
  visitNumber: 'ms.visit_number',
  // Override URL path — use ms.url_path from CTE
  entryUrlPath: CLEAN_URL('ms.url_path'),
  // Override bot score — references ms.bot_score in funnel CTE context
  entryBotScore: BOT_SCORE_CASE('ms'),
  // Product expression is the same (ap alias comes from the JOIN, not the CTE)
  entryProduct: PRODUCT_EXPR,
};

/**
 * Enriched entry dimensions that have both IDs and display names
 * in marketing_merged_ads_spending.
 */
const ENRICHED_DIMS: Record<string, {
  idColumn: string;
  nameColumn: string;
  rawColumn: string;
  joinOn: string;
  distinctCols: string;
}> = {
  entryCampaign: {
    idColumn: 'campaign_id',
    nameColumn: 'campaign_name',
    rawColumn: 's.utm_campaign',
    joinOn: 's.utm_campaign::text = mas.campaign_id::text',
    distinctCols: 'campaign_id, campaign_name',
  },
  entryAdset: {
    idColumn: 'adset_id',
    nameColumn: 'adset_name',
    rawColumn: 's.utm_content',
    joinOn: 's.utm_campaign::text = mas.campaign_id::text AND s.utm_content::text = mas.adset_id::text',
    distinctCols: 'campaign_id, adset_id, adset_name',
  },
  entryAd: {
    idColumn: 'ad_id',
    nameColumn: 'ad_name',
    rawColumn: 's.utm_medium',
    joinOn: 's.utm_campaign::text = mas.campaign_id::text AND s.utm_content::text = mas.adset_id::text AND s.utm_medium::text = mas.ad_id::text',
    distinctCols: 'campaign_id, adset_id, ad_id, ad_name',
  },
  // Page-view level equivalents (same columns, used in all-pv mode)
  campaign: {
    idColumn: 'campaign_id',
    nameColumn: 'campaign_name',
    rawColumn: 's.utm_campaign',
    joinOn: 's.utm_campaign::text = mas.campaign_id::text',
    distinctCols: 'campaign_id, campaign_name',
  },
  adset: {
    idColumn: 'adset_id',
    nameColumn: 'adset_name',
    rawColumn: 's.utm_content',
    joinOn: 's.utm_campaign::text = mas.campaign_id::text AND s.utm_content::text = mas.adset_id::text',
    distinctCols: 'campaign_id, adset_id, adset_name',
  },
  ad: {
    idColumn: 'ad_id',
    nameColumn: 'ad_name',
    rawColumn: 's.utm_medium',
    joinOn: 's.utm_campaign::text = mas.campaign_id::text AND s.utm_content::text = mas.adset_id::text AND s.utm_medium::text = mas.ad_id::text',
    distinctCols: 'campaign_id, adset_id, ad_id, ad_name',
  },
};

// ── Detail query column maps ─────────────────────────────────────────

/** Maps detail filter dimension IDs to SQL expressions for page-view level queries */
const DETAIL_FILTER_MAP: Record<string, string> = {
  urlPath: CLEAN_URL('pv.url_path'),
  pageType: 'pv.page_type',
  utmSource: 'LOWER(s.utm_source)',
  campaign: 's.utm_campaign',
  adset: 's.utm_content',
  ad: 's.utm_medium',
  webmasterId: 's.utm_medium',
  funnelId: 's.ff_funnel_id',
  utmTerm: 's.utm_term',
  keyword: 's.keyword',
  placement: 's.placement',
  referrer: 's.refferer',
  deviceType: 's.device_type',
  osName: 's.os_name',
  browserName: 's.browser_name',
  countryCode: 's.country_code',
  timezone: 's.timezone',
  botScore: BOT_SCORE_CASE('s'),
  visitNumber: 'DENSE_RANK() OVER (PARTITION BY s.visitor_id ORDER BY s.created_at)',
  localHour: "EXTRACT(HOUR FROM pv.viewed_at AT TIME ZONE COALESCE(s.timezone, 'UTC'))::int",
  date: 'pv.viewed_at::date',
};

/** Maps entry-level dimension IDs to SQL conditions for session subquery */
const ENTRY_FILTER_MAP: Record<string, string> = {
  entryUrlPath: CLEAN_URL('fpv.url_path'),
  entryPageType: 'fpv.page_type',
  entryUtmSource: 's2.utm_source',
  entryCampaign: 's2.utm_campaign',
  entryAdset: 's2.utm_content',
  entryAd: 's2.utm_medium',
  entryWebmasterId: 's2.utm_medium',
  entryUtmTerm: 's2.utm_term',
  entryKeyword: 's2.keyword',
  entryPlacement: 's2.placement',
  entryReferrer: 's2.refferer',
  entryCountryCode: 's2.country_code',
  entryDeviceType: 's2.device_type',
  entryOsName: 's2.os_name',
  entryBrowserName: 's2.browser_name',
  entryBotScore: BOT_SCORE_CASE('s2'),
};

/** Metric filters for detail mode */
const METRIC_FILTER_MAP: Record<string, string> = {
  scrollPastHero: 'COALESCE(ev.hero_scroll_passed, false) = true',
  formViews: 'COALESCE(ev.form_view, false) = true',
  formStarters: 'COALESCE(ev.form_started, false) = true',
};

// ── Helpers ──────────────────────────────────────────────────────────

/** Determine if a dimension is an entry-level dim */
function isEntryDim(dim: string): boolean {
  return dim in ENTRY_DIMENSION_MAP && dim !== 'funnelId' && dim !== 'visitNumber' && dim !== 'date';
}

/** Check if the product classification JOIN is needed */
function needsProductJoin(
  dimensions: string[],
  filters?: Array<{ field: string }>,
): boolean {
  const productDims = ['entryProduct'];
  return dimensions.some(d => productDims.includes(d)) ||
    (filters || []).some(f => productDims.includes(f.field));
}

/** Build product classification LEFT JOIN clause */
function buildProductJoin(urlPathExpr: string): string {
  return '\n    LEFT JOIN app_url_classifications uc ON ' + urlPathExpr + ' = uc.url_path AND uc.is_ignored = false' +
    '\n    LEFT JOIN app_products ap ON uc.product_id = ap.id';
}

/** Build enriched JOIN for campaign/adset/ad name resolution */
function buildEnrichedJoin(enrichedDims: string[]): { distinctCols: string; joinOn: string } {
  const colSet = new Set<string>();
  for (const dim of enrichedDims) {
    const config = ENRICHED_DIMS[dim];
    if (!config) continue;
    for (const col of config.distinctCols.split(', ')) {
      colSet.add(col.trim());
    }
    colSet.add(config.nameColumn);
  }

  let joinOn: string;
  if (enrichedDims.includes('entryAd')) {
    joinOn = ENRICHED_DIMS.entryAd.joinOn;
  } else if (enrichedDims.includes('entryAdset')) {
    joinOn = ENRICHED_DIMS.entryAdset.joinOn;
  } else {
    joinOn = ENRICHED_DIMS.entryCampaign.joinOn;
  }

  return { distinctCols: Array.from(colSet).join(', '), joinOn };
}

/**
 * Build filter clauses for flat queries.
 * Same field = OR, different fields = AND.
 * Enriched dims match by both raw ID and display name.
 */
function buildFlatFilterClause(
  filters: Array<{ field: string; operator: string; value: string }>,
  params: SqlParam[],
  dimensionMap: Record<string, string>,
): string {
  const byField = new Map<string, Array<{ operator: string; value: string }>>();
  for (const f of filters) {
    if (!dimensionMap[f.field]) continue;
    if (!byField.has(f.field)) byField.set(f.field, []);
    byField.get(f.field)!.push({ operator: f.operator, value: f.value });
  }

  let clause = '';
  for (const [field, conditions] of byField) {
    const col = dimensionMap[field]!;
    const enriched = ENRICHED_DIMS[field];
    const orParts: string[] = [];

    for (const { operator, value } of conditions) {
      params.push(value);
      const paramRef = '$' + String(params.length);

      const nameSubquery = enriched
        ? 'SELECT DISTINCT ' + enriched.idColumn + '::text FROM marketing_merged_ads_spending WHERE date::date BETWEEN $1::date AND $2::date AND LOWER(' + enriched.nameColumn + ') = LOWER(' + paramRef + ')'
        : null;

      switch (operator) {
        case 'equals':
          if (nameSubquery) {
            orParts.push('(LOWER(' + col + '::text) = LOWER(' + paramRef + ') OR ' + col + '::text IN (' + nameSubquery + '))');
          } else {
            orParts.push('LOWER(' + col + '::text) = LOWER(' + paramRef + ')');
          }
          break;
        case 'not_equals':
          if (nameSubquery) {
            orParts.push('(LOWER(' + col + '::text) != LOWER(' + paramRef + ') AND ' + col + '::text NOT IN (' + nameSubquery + '))');
          } else {
            orParts.push('LOWER(' + col + '::text) != LOWER(' + paramRef + ')');
          }
          break;
        case 'contains': {
          if (enriched) {
            const nameLikeSubquery = 'SELECT DISTINCT ' + enriched.idColumn + '::text FROM marketing_merged_ads_spending WHERE date::date BETWEEN $1::date AND $2::date AND LOWER(' + enriched.nameColumn + ') LIKE \'%\' || LOWER(' + paramRef + ') || \'%\'';
            orParts.push('(LOWER(' + col + '::text) LIKE \'%\' || LOWER(' + paramRef + ') || \'%\' OR ' + col + '::text IN (' + nameLikeSubquery + '))');
          } else {
            orParts.push('LOWER(' + col + '::text) LIKE \'%\' || LOWER(' + paramRef + ') || \'%\'');
          }
          break;
        }
        case 'not_contains': {
          if (enriched) {
            const nameNotLikeSubquery = 'SELECT DISTINCT ' + enriched.idColumn + '::text FROM marketing_merged_ads_spending WHERE date::date BETWEEN $1::date AND $2::date AND LOWER(' + enriched.nameColumn + ') LIKE \'%\' || LOWER(' + paramRef + ') || \'%\'';
            orParts.push('(LOWER(' + col + '::text) NOT LIKE \'%\' || LOWER(' + paramRef + ') || \'%\' AND ' + col + '::text NOT IN (' + nameNotLikeSubquery + '))');
          } else {
            orParts.push('LOWER(' + col + '::text) NOT LIKE \'%\' || LOWER(' + paramRef + ') || \'%\'');
          }
          break;
        }
      }
    }

    if (orParts.length > 0) {
      clause += ' AND (' + orParts.join(' OR ') + ')';
    }
  }

  return clause;
}

// ── Flat query (sessions/query API) ──────────────────────────────────

export interface TrackerFlatParams {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  filters?: Array<{ field: string; operator: FilterOperator; value: string }>;
}

/**
 * Flat query grouped by ALL selected dimensions.
 * Returns raw metric counts — client computes derived metrics.
 *
 * Modes:
 *   entry — entry_* dims, queries first page view per session via CTE
 *   funnel — funnelStep dimension, all page views for matching sessions
 *   all-pv — page-view level dims, every page view
 */
export async function getTrackerDataFlat(
  params: TrackerFlatParams,
): Promise<Record<string, string | number>[]> {
  const { dateRange, dimensions, filters } = params;
  const isFunnelMode = dimensions.includes('funnelStep');
  const hasEntryDims = dimensions.some(d => isEntryDim(d));

  if (isFunnelMode) {
    return buildFunnelQuery(dateRange, dimensions, filters);
  }
  if (hasEntryDims) {
    return buildEntryQuery(dateRange, dimensions, filters);
  }
  return buildAllPvQuery(dateRange, dimensions, filters);
}

/** Entry mode: one row per session (first page view via CTE) */
async function buildEntryQuery(
  dateRange: TrackerFlatParams['dateRange'],
  dimensions: string[],
  filters?: TrackerFlatParams['filters'],
): Promise<Record<string, string | number>[]> {
  const sqlParams: SqlParam[] = [
    formatLocalDate(dateRange.start),
    formatLocalDate(dateRange.end),
  ];

  const enrichedDims = dimensions.filter(d => d in ENRICHED_DIMS);
  const needsJoin = enrichedDims.length > 0;

  const selectParts: string[] = [];
  const groupByParts: string[] = [];

  for (const dim of dimensions) {
    const enriched = ENRICHED_DIMS[dim];
    if (enriched) {
      selectParts.push(enriched.rawColumn + '::text AS "_' + dim + '_id"');
      selectParts.push(
        'COALESCE(MAX(mas.' + enriched.nameColumn + '), ' + enriched.rawColumn + '::text, \'Unknown\') AS "' + dim + '"'
      );
      groupByParts.push(enriched.rawColumn);
    } else {
      const col = ENTRY_DIMENSION_MAP[dim];
      if (!col) throw new Error('Unknown entry dimension: ' + dim);
      selectParts.push(col + ' AS "' + dim + '"');
      // Window functions can't be in GROUP BY — use alias
      if (dim === 'visitNumber') {
        groupByParts.push('s.visitor_id');
        groupByParts.push('s.created_at');
      } else if (col.includes('::date')) {
        groupByParts.push(col);
      } else {
        groupByParts.push('"' + dim + '"');
      }
    }
  }

  let whereClause = 'WHERE s.created_at >= $1::date AND s.created_at < ($2::date + interval \'1 day\')';

  if (filters && filters.length > 0) {
    whereClause += buildFlatFilterClause(filters, sqlParams, ENTRY_DIMENSION_MAP);
  }

  let fromClause = buildBaseFrom('entry_pv');
  if (needsJoin) {
    const joinConfig = buildEnrichedJoin(enrichedDims);
    fromClause += '\n    LEFT JOIN (\n      SELECT DISTINCT ' + joinConfig.distinctCols +
      '\n      FROM marketing_merged_ads_spending\n    ) mas ON ' + joinConfig.joinOn;
  }
  if (needsProductJoin(dimensions, filters)) {
    fromClause += buildProductJoin('pv.url_path');
  }

  // Metrics use entry-level expressions
  const activeTimeExpr = ACTIVE_TIME_EXPR;

  const query = ENTRY_CTE + '\n  SELECT\n    ' + selectParts.join(',\n    ') + ',\n' +
    '    COUNT(*) AS page_views,\n' +
    '    COUNT(DISTINCT s.visitor_id) AS unique_visitors,\n' +
    '    COUNT(*) FILTER (WHERE ' + activeTimeExpr + ' IS NOT NULL AND ' + activeTimeExpr + ' < 5) AS bounced_count,\n' +
    '    COUNT(*) FILTER (WHERE ' + activeTimeExpr + ' IS NOT NULL) AS active_time_count,\n' +
    '    COALESCE(SUM(' + activeTimeExpr + '), 0) AS total_active_time,\n' +
    '    COUNT(*) FILTER (WHERE COALESCE(ev.hero_scroll_passed, false) = true) AS scroll_past_hero,\n' +
    '    COUNT(*) FILTER (WHERE COALESCE(ev.form_view, false) = true) AS form_views,\n' +
    '    COUNT(*) FILTER (WHERE COALESCE(ev.form_started, false) = true) AS form_starters\n' +
    '  ' + fromClause + '\n' +
    '  ' + whereClause + '\n' +
    '  GROUP BY ' + groupByParts.join(', ') + '\n' +
    '';

  const rows = await executeQuery<Record<string, unknown>>(query, sqlParams);
  return normalizeRows(rows, dimensions);
}

/** All-page-view mode: every page view, not just entry */
async function buildAllPvQuery(
  dateRange: TrackerFlatParams['dateRange'],
  dimensions: string[],
  filters?: TrackerFlatParams['filters'],
): Promise<Record<string, string | number>[]> {
  const sqlParams: SqlParam[] = [
    formatLocalDate(dateRange.start),
    formatLocalDate(dateRange.end),
  ];

  const enrichedDims = dimensions.filter(d => d in ENRICHED_DIMS);
  const needsJoin = enrichedDims.length > 0;

  const selectParts: string[] = [];
  const groupByParts: string[] = [];

  for (const dim of dimensions) {
    const enriched = ENRICHED_DIMS[dim];
    if (enriched) {
      selectParts.push(enriched.rawColumn + '::text AS "_' + dim + '_id"');
      selectParts.push(
        'COALESCE(MAX(mas.' + enriched.nameColumn + '), ' + enriched.rawColumn + '::text, \'Unknown\') AS "' + dim + '"'
      );
      groupByParts.push(enriched.rawColumn);
    } else {
      const col = PAGE_VIEW_DIMENSION_MAP[dim];
      if (!col) throw new Error('Unknown page-view dimension: ' + dim);
      selectParts.push(col + ' AS "' + dim + '"');
      if (dim === 'visitNumber') {
        groupByParts.push('s.visitor_id');
        groupByParts.push('s.created_at');
      } else if (col.includes('::date')) {
        groupByParts.push(col);
      } else {
        groupByParts.push('"' + dim + '"');
      }
    }
  }

  let whereClause = 'WHERE pv.viewed_at >= $1::date AND pv.viewed_at < ($2::date + interval \'1 day\')';
  if (filters && filters.length > 0) {
    whereClause += buildFlatFilterClause(filters, sqlParams, PAGE_VIEW_DIMENSION_MAP);
  }

  let fromClause = buildBaseFrom('tracker_page_views');
  if (needsJoin) {
    const joinConfig = buildEnrichedJoin(enrichedDims);
    fromClause += '\n    LEFT JOIN (\n      SELECT DISTINCT ' + joinConfig.distinctCols +
      '\n      FROM marketing_merged_ads_spending\n    ) mas ON ' + joinConfig.joinOn;
  }
  if (needsProductJoin(dimensions, filters)) {
    fromClause += buildProductJoin('pv.url_path');
  }

  const activeTimeExpr = ACTIVE_TIME_EXPR;

  const query = 'SELECT\n    ' + selectParts.join(',\n    ') + ',\n' +
    '    COUNT(*) AS page_views,\n' +
    '    COUNT(DISTINCT s.visitor_id) AS unique_visitors,\n' +
    '    COUNT(*) FILTER (WHERE ' + activeTimeExpr + ' IS NOT NULL AND ' + activeTimeExpr + ' < 5) AS bounced_count,\n' +
    '    COUNT(*) FILTER (WHERE ' + activeTimeExpr + ' IS NOT NULL) AS active_time_count,\n' +
    '    COALESCE(SUM(' + activeTimeExpr + '), 0) AS total_active_time,\n' +
    '    COUNT(*) FILTER (WHERE COALESCE(ev.hero_scroll_passed, false) = true) AS scroll_past_hero,\n' +
    '    COUNT(*) FILTER (WHERE COALESCE(ev.form_view, false) = true) AS form_views,\n' +
    '    COUNT(*) FILTER (WHERE COALESCE(ev.form_started, false) = true) AS form_starters\n' +
    '  ' + fromClause + '\n' +
    '  ' + whereClause + '\n' +
    '  GROUP BY ' + groupByParts.join(', ');

  const rows = await executeQuery<Record<string, unknown>>(query, sqlParams);
  return normalizeRows(rows, dimensions);
}

/** Funnel mode: CTE selects matching sessions, then aggregates all page views */
async function buildFunnelQuery(
  dateRange: TrackerFlatParams['dateRange'],
  dimensions: string[],
  filters?: TrackerFlatParams['filters'],
): Promise<Record<string, string | number>[]> {
  const sqlParams: SqlParam[] = [
    formatLocalDate(dateRange.start),
    formatLocalDate(dateRange.end),
  ];

  // CTE needs: session_id + all entry-level columns used by dims
  const cteSelectCols = new Set<string>(['session_id']);
  for (const dim of dimensions) {
    if (dim === 'funnelStep' || dim === 'date') continue;
    if (dim === 'visitNumber') {
      cteSelectCols.add('DENSE_RANK() OVER (PARTITION BY s.visitor_id ORDER BY s.created_at) AS visit_number');
      continue;
    }
    // Bot score needs bot_score from session
    if (dim === 'entryBotScore') {
      cteSelectCols.add('bot_score');
      continue;
    }
    // URL-based dims need url_path from page view
    if (dim === 'entryUrlPath' || dim === 'entryProduct') {
      cteSelectCols.add('url_path');
      continue;
    }
    const col = ENTRY_DIMENSION_MAP[dim];
    if (col && !col.includes('DENSE_RANK') && /^(pv\.|s\.)/.test(col)) {
      const bare = col.replace(/^(pv\.|s\.)/, '');
      cteSelectCols.add(bare);
    }
  }

  // Build main SELECT/GROUP BY
  const enrichedDims = dimensions.filter(d => d in ENRICHED_DIMS);
  const needsEnrichedJoin = enrichedDims.length > 0;

  const selectParts: string[] = [];
  const groupByParts: string[] = [];

  for (const dim of dimensions) {
    const enriched = ENRICHED_DIMS[dim];
    if (enriched) {
      // In funnel mode, enriched raw columns use ms.* prefix (from matching_sessions CTE)
      const funnelRawCol = enriched.rawColumn.replace('s.', 'ms.');
      selectParts.push(funnelRawCol + '::text AS "_' + dim + '_id"');
      selectParts.push(
        'COALESCE(MAX(mas.' + enriched.nameColumn + '), ' + funnelRawCol + '::text, \'Unknown\') AS "' + dim + '"'
      );
      groupByParts.push(funnelRawCol);
    } else {
      const funnelCol = FUNNEL_DIMENSION_MAP[dim];
      if (!funnelCol) throw new Error('Unknown funnel dimension: ' + dim);
      selectParts.push(funnelCol + ' AS "' + dim + '"');

      if (dim === 'funnelStep' || dim === 'date') {
        groupByParts.push(funnelCol);
      } else {
        groupByParts.push('"' + dim + '"');
      }
    }
  }

  // CTE WHERE + entry-level filters
  let cteFilterClause = '';
  let mainFilterClause = '';
  if (filters && filters.length > 0) {
    const entryFilters = filters.filter(f => f.field !== 'funnelStep');
    if (entryFilters.length > 0) {
      cteFilterClause = buildFlatFilterClause(entryFilters, sqlParams, ENTRY_DIMENSION_MAP);
    }
    const funnelFilters = filters.filter(f => f.field === 'funnelStep');
    if (funnelFilters.length > 0) {
      mainFilterClause = buildFlatFilterClause(funnelFilters, sqlParams, FUNNEL_DIMENSION_MAP);
    }
  }

  const activeTimeExpr = ACTIVE_TIME_EXPR;

  const query = ENTRY_CTE + '\n' +
    ', matching_sessions AS (\n' +
    '  SELECT ' + Array.from(cteSelectCols).map(c => {
      if (c.includes('DENSE_RANK')) return c;
      if (c === 'session_id') return 'pv.' + c;
      // Determine correct table alias
      const sessionCols = ['utm_source', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_term',
        'keyword', 'placement', 'refferer', 'ff_funnel_id', 'country_code', 'device_type',
        'os_name', 'browser_name', 'visitor_id', 'created_at', 'timezone', 'language', 'bot_score'];
      return sessionCols.includes(c) ? 's.' + c : 'pv.' + c;
    }).join(', ') + '\n' +
    '  FROM entry_pv pv\n' +
    '  JOIN tracker_sessions s ON pv.session_id = s.session_id\n' +
    '  WHERE s.created_at >= $1::date AND s.created_at < ($2::date + interval \'1 day\')' + cteFilterClause + '\n' +
    ')\n' +
    'SELECT\n  ' + selectParts.join(',\n  ') + ',\n' +
    '  COUNT(*) AS page_views,\n' +
    '  COUNT(DISTINCT pv.session_id) AS unique_visitors,\n' +
    '  COUNT(*) FILTER (WHERE ' + activeTimeExpr + ' IS NOT NULL AND ' + activeTimeExpr + ' < 5) AS bounced_count,\n' +
    '  COUNT(*) FILTER (WHERE ' + activeTimeExpr + ' IS NOT NULL) AS active_time_count,\n' +
    '  COALESCE(SUM(' + activeTimeExpr + '), 0) AS total_active_time,\n' +
    '  COUNT(*) FILTER (WHERE COALESCE(ev.hero_scroll_passed, false) = true) AS scroll_past_hero,\n' +
    '  COUNT(*) FILTER (WHERE COALESCE(ev.form_view, false) = true) AS form_views,\n' +
    '  COUNT(*) FILTER (WHERE COALESCE(ev.form_started, false) = true) AS form_starters\n' +
    'FROM tracker_page_views pv\n' +
    'JOIN tracker_sessions s ON pv.session_id = s.session_id\n' +
    'LEFT JOIN LATERAL (\n' +
    '  SELECT MAX(cumulative_active_ms) AS cumulative_active_ms\n' +
    '  FROM tracker_raw_heartbeats rh WHERE rh.page_view_id = pv.page_view_id\n' +
    ') hb ON true\n' +
    'LEFT JOIN LATERAL (\n' +
    '  SELECT\n' +
    '    bool_or(e.event_name = \'element_signal\' AND e.signal_id IN (\'hero-section\',\'hero\') AND e.action = \'out_view\') AS hero_scroll_passed,\n' +
    '    bool_or(e.event_name = \'form\' AND e.action = \'visible\') AS form_view,\n' +
    '    bool_or(e.event_name = \'form\' AND e.action = \'started\') AS form_started\n' +
    '  FROM tracker_events e WHERE e.page_view_id = pv.page_view_id\n' +
    ') ev ON true\n' +
    'JOIN matching_sessions ms ON pv.session_id = ms.session_id\n' +
    (needsEnrichedJoin ? (() => {
      const joinConfig = buildEnrichedJoin(enrichedDims);
      const adaptedJoinOn = joinConfig.joinOn.replace(/\bs\./g, 'ms.');
      return 'LEFT JOIN (\n  SELECT DISTINCT ' + joinConfig.distinctCols +
        '\n  FROM marketing_merged_ads_spending\n) mas ON ' + adaptedJoinOn + '\n';
    })() : '') +
    (needsProductJoin(dimensions, filters) ? buildProductJoin('ms.url_path').trimStart() + '\n' : '') +
    'WHERE pv.viewed_at >= $1::date AND pv.viewed_at < ($2::date + interval \'1 day\')' + mainFilterClause + '\n' +
    'GROUP BY ' + groupByParts.join(', ');

  const rows = await executeQuery<Record<string, unknown>>(query, sqlParams);
  return normalizeRows(rows, dimensions);
}

/** Normalize DB rows: Date → YYYY-MM-DD, null → 'Unknown', metrics → numbers */
function normalizeRows(
  rows: Record<string, unknown>[],
  dimensions: string[],
): Record<string, string | number>[] {
  return rows.map(row => {
    const result: Record<string, string | number> = {};

    for (const dim of dimensions) {
      const raw = row[dim];
      if (raw instanceof Date) {
        const y = String(raw.getUTCFullYear());
        const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
        const d = String(raw.getUTCDate()).padStart(2, '0');
        result[dim] = y + '-' + m + '-' + d;
      } else {
        result[dim] = raw != null ? String(raw) : 'Unknown';
      }

      // Include companion ID for enriched dimensions
      const idKey = '_' + dim + '_id';
      if (row[idKey] != null) {
        result[idKey] = String(row[idKey]);
      }
    }

    result.page_views = Number(row.page_views) || 0;
    result.unique_visitors = Number(row.unique_visitors) || 0;
    result.bounced_count = Number(row.bounced_count) || 0;
    result.active_time_count = Number(row.active_time_count) || 0;
    result.total_active_time = Number(row.total_active_time) || 0;
    result.scroll_past_hero = Number(row.scroll_past_hero) || 0;
    result.form_views = Number(row.form_views) || 0;
    result.form_starters = Number(row.form_starters) || 0;

    return result;
  });
}

// ── Detail query (on-page detail API) ────────────────────────────────

export interface TrackerDetailParams {
  dateRange: { start: Date; end: Date };
  dimensionFilters: Record<string, string>;
  metricId?: string;
  page: number;
  pageSize: number;
}

/** Detail columns selected for individual page view records */
const DETAIL_SELECT_COLS = `
    pv.page_view_id AS id,
    pv.viewed_at AS created_at,
    pv.url_path,
    pv.url_full,
    s.visitor_id AS ff_visitor_id,
    pv.session_id,
    DENSE_RANK() OVER (PARTITION BY s.visitor_id ORDER BY s.created_at) AS visit_number,
    ${ACTIVE_TIME_EXPR} AS active_time_s,
    ev.scroll_percent,
    COALESCE(ev.hero_scroll_passed, false) AS hero_scroll_passed,
    COALESCE(ev.form_view, false) AS form_view,
    COALESCE(ev.form_started, false) AS form_started,
    COALESCE(ev.cta_viewed, false) AS cta_viewed,
    COALESCE(ev.cta_clicked, false) AS cta_clicked,
    s.device_type,
    s.country_code,
    pv.page_type,
    s.utm_source,
    s.utm_campaign,
    s.utm_content,
    s.utm_medium,
    s.utm_term,
    s.keyword,
    s.placement,
    s.refferer AS referrer,
    s.user_agent,
    s.language,
    NULL::text AS platform,
    s.os_name,
    s.browser_name,
    pv.fcp_ms / 1000.0 AS fcp_s,
    pv.lcp_ms / 1000.0 AS lcp_s,
    pv.tti_ms / 1000.0 AS tti_s,
    pv.dcl_ms / 1000.0 AS dcl_s,
    pv.load_ms / 1000.0 AS load_s,
    s.timezone,
    EXTRACT(HOUR FROM pv.viewed_at AT TIME ZONE COALESCE(s.timezone, 'UTC'))::int AS local_hour_of_day,
    COALESCE(ev.form_errors, 0) AS form_errors,
    ev.form_errors_detail`;

/**
 * Returns individual page view records with pagination.
 * Supports page-view filters, entry-level filters (via subquery), and classification filters.
 */
export async function getTrackerDetail(
  opts: TrackerDetailParams,
): Promise<{ records: Record<string, unknown>[]; total: number }> {
  const { dateRange, dimensionFilters, metricId, page, pageSize } = opts;

  const baseParams: SqlParam[] = [
    formatLocalDate(dateRange.start),
    formatLocalDate(dateRange.end),
  ];

  const conditions: string[] = [];
  const entryConditions: string[] = [];
  const entryParams: SqlParam[] = []; // track params used in entry subquery

  for (const [dimId, value] of Object.entries(dimensionFilters)) {
    // Classification dims
    if (dimId === 'classifiedProduct') {
      if (value === 'Unknown') {
        conditions.push('pv.url_path NOT IN (SELECT uc_f.url_path FROM app_url_classifications uc_f WHERE uc_f.is_ignored = false)');
      } else {
        baseParams.push(value);
        conditions.push('pv.url_path IN (SELECT uc_f.url_path FROM app_url_classifications uc_f JOIN app_products ap_f ON uc_f.product_id = ap_f.id WHERE uc_f.is_ignored = false AND ap_f.id::text = $' + String(baseParams.length) + ')');
      }
      continue;
    }
    if (dimId === 'classifiedCountry') {
      if (value === 'Unknown') {
        conditions.push('pv.url_path NOT IN (SELECT uc_f.url_path FROM app_url_classifications uc_f WHERE uc_f.is_ignored = false)');
      } else {
        baseParams.push(value);
        conditions.push('pv.url_path IN (SELECT uc_f.url_path FROM app_url_classifications uc_f WHERE uc_f.is_ignored = false AND uc_f.country_code = $' + String(baseParams.length) + ')');
      }
      continue;
    }

    // Entry-level dims: collected into one session subquery
    const entryCol = ENTRY_FILTER_MAP[dimId];
    if (entryCol) {
      if (value === 'Unknown') {
        entryConditions.push(entryCol + ' IS NULL');
      } else {
        baseParams.push(value);
        entryConditions.push(entryCol + '::text = $' + String(baseParams.length));
      }
      continue;
    }

    // Page-view level dims
    const col = DETAIL_FILTER_MAP[dimId];
    if (!col) continue;

    if (value === 'Unknown') {
      conditions.push(col + ' IS NULL');
    } else {
      baseParams.push(value);
      conditions.push(col + '::text = $' + String(baseParams.length));
    }
  }

  // Consolidate entry-level filters into a single subquery
  if (entryConditions.length > 0) {
    conditions.push(
      'pv.session_id IN (' +
        'SELECT fpv.session_id FROM (' +
          'SELECT DISTINCT ON (session_id) * FROM tracker_page_views ORDER BY session_id, viewed_at ASC' +
        ') fpv ' +
        'JOIN tracker_sessions s2 ON fpv.session_id = s2.session_id ' +
        'WHERE s2.created_at >= $1::date AND s2.created_at < ($2::date + interval \'1 day\') AND ' + entryConditions.join(' AND ') +
      ')'
    );
  }

  // Metric-specific filter
  if (metricId && METRIC_FILTER_MAP[metricId]) {
    conditions.push(METRIC_FILTER_MAP[metricId]);
  }

  const whereExtra = conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';
  const isUniqueVisitors = metricId === 'uniqueVisitors';
  const hasEntryFilters = entryConditions.length > 0;

  const baseWhere = 'WHERE pv.viewed_at >= $1::date AND pv.viewed_at < ($2::date + interval \'1 day\')' + whereExtra;

  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.min(50000, Math.floor(pageSize)));
  const offset = (safePage - 1) * safePageSize;

  const fromClause = buildBaseFrom('tracker_page_views');

  // Build data and count queries
  let dataQuery: string;
  let countQuery: string;

  if (hasEntryFilters) {
    // Session-scoped mode: count sessions, show one page view per session
    const sessionEntryFilter = entryConditions.join(' AND ');
    const sessionMetricFilter = metricId ? buildSessionMetricFilter(metricId) : '';
    const sessionWhere = 'WHERE s2.created_at >= $1::date AND s2.created_at < ($2::date + interval \'1 day\') AND ' +
      sessionEntryFilter + sessionMetricFilter;

    countQuery = isUniqueVisitors
      ? 'SELECT COUNT(DISTINCT s2.visitor_id) as total FROM (' +
        'SELECT DISTINCT ON (session_id) * FROM tracker_page_views ORDER BY session_id, viewed_at ASC' +
        ') fpv JOIN tracker_sessions s2 ON fpv.session_id = s2.session_id ' + sessionWhere
      : 'SELECT COUNT(*) as total FROM (' +
        'SELECT DISTINCT ON (session_id) * FROM tracker_page_views ORDER BY session_id, viewed_at ASC' +
        ') fpv JOIN tracker_sessions s2 ON fpv.session_id = s2.session_id ' + sessionWhere;

    if (isUniqueVisitors) {
      dataQuery = 'SELECT * FROM (\n' +
        '  SELECT DISTINCT ON (s.visitor_id) ' + DETAIL_SELECT_COLS + '\n' +
        '  ' + fromClause + '\n' +
        '  ' + baseWhere + '\n' +
        '  ORDER BY s.visitor_id, pv.viewed_at DESC\n' +
        ') sub\n' +
        'ORDER BY created_at DESC\n' +
        'LIMIT ' + safePageSize + ' OFFSET ' + offset;
    } else {
      dataQuery = 'SELECT * FROM (\n' +
        '  SELECT DISTINCT ON (pv.session_id) ' + DETAIL_SELECT_COLS + '\n' +
        '  ' + fromClause + '\n' +
        '  ' + baseWhere + '\n' +
        '  ORDER BY pv.session_id, pv.viewed_at ASC\n' +
        ') sub\n' +
        'ORDER BY created_at DESC\n' +
        'LIMIT ' + safePageSize + ' OFFSET ' + offset;
    }
  } else {
    // Standard page-view mode
    if (isUniqueVisitors) {
      dataQuery = 'SELECT * FROM (\n' +
        '  SELECT DISTINCT ON (s.visitor_id) ' + DETAIL_SELECT_COLS + '\n' +
        '  ' + fromClause + '\n' +
        '  ' + baseWhere + '\n' +
        '  ORDER BY s.visitor_id, pv.viewed_at DESC\n' +
        ') sub\n' +
        'ORDER BY created_at DESC\n' +
        'LIMIT ' + safePageSize + ' OFFSET ' + offset;

      countQuery = 'SELECT COUNT(DISTINCT s.visitor_id) as total\n' +
        fromClause + '\n' + baseWhere;
    } else {
      dataQuery = 'SELECT ' + DETAIL_SELECT_COLS + '\n' +
        fromClause + '\n' +
        baseWhere + '\n' +
        'ORDER BY pv.viewed_at DESC\n' +
        'LIMIT ' + safePageSize + ' OFFSET ' + offset;

      countQuery = 'SELECT COUNT(*) as total\n' +
        fromClause + '\n' + baseWhere;
    }
  }

  const [rows, countResult] = await Promise.all([
    executeQuery<Record<string, unknown>>(dataQuery, baseParams),
    executeQuery<{ total: string }>(countQuery, baseParams),
  ]);

  return {
    records: rows,
    total: Number(countResult[0]?.total) || 0,
  };
}

/** Build session-level metric filter for count queries */
function buildSessionMetricFilter(metricId: string): string {
  const map: Record<string, string> = {
    scrollPastHero: ' AND EXISTS (SELECT 1 FROM tracker_events e WHERE e.page_view_id = fpv.page_view_id AND e.event_name = \'element_signal\' AND e.signal_id IN (\'hero-section\',\'hero\') AND e.action = \'out_view\')',
    formViews: ' AND EXISTS (SELECT 1 FROM tracker_events e WHERE e.page_view_id = fpv.page_view_id AND e.event_name = \'form\' AND e.action = \'visible\')',
    formStarters: ' AND EXISTS (SELECT 1 FROM tracker_events e WHERE e.page_view_id = fpv.page_view_id AND e.event_name = \'form\' AND e.action = \'started\')',
  };
  return map[metricId] || '';
}

// ── Campaign performance queries ─────────────────────────────────────

interface OnPageFields {
  pageViews: number;
  uniqueVisitors: number;
  formViews: number;
  formStarters: number;
  bounceRate: number;
  scrollPastHero: number;
  avgTimeOnPage: number | null;
}

/**
 * Aggregate on-page metrics grouped by utm_campaign.
 * Replaces fetchOnPageMetrics() in campaignPerformance.ts.
 */
export async function getTrackerMetricsByCampaign(
  externalIds: string[],
  dateRange: { start: Date; end: Date },
): Promise<Map<string, OnPageFields>> {
  if (externalIds.length === 0) return new Map();

  const startTs = formatLocalDate(dateRange.start) + 'T00:00:00';
  const endTs = formatLocalDate(dateRange.end) + 'T23:59:59.999';
  const activeTimeExpr = ACTIVE_TIME_EXPR;

  const rows = await executeQuery<{
    campaign_id: string;
    page_views: string | number;
    unique_visitors: string | number;
    form_views: string | number;
    form_starters: string | number;
    bounce_rate: string | number | null;
    scroll_past_hero: string | number;
    avg_time_on_page: string | number | null;
  }>(`
    SELECT
      s.utm_campaign AS campaign_id,
      COUNT(*) AS page_views,
      COUNT(DISTINCT s.visitor_id) AS unique_visitors,
      COUNT(*) FILTER (WHERE COALESCE(ev.form_view, false) = true) AS form_views,
      COUNT(*) FILTER (WHERE COALESCE(ev.form_started, false) = true) AS form_starters,
      ROUND(
        COUNT(*) FILTER (WHERE ${activeTimeExpr} IS NOT NULL AND ${activeTimeExpr} < 5)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE ${activeTimeExpr} IS NOT NULL), 0),
        4
      ) AS bounce_rate,
      COUNT(*) FILTER (WHERE COALESCE(ev.hero_scroll_passed, false) = true) AS scroll_past_hero,
      ROUND(AVG(${activeTimeExpr})::numeric, 2) AS avg_time_on_page
    ${buildBaseFrom('tracker_page_views')}
    WHERE pv.viewed_at >= $1::timestamp AND pv.viewed_at <= $2::timestamp
      AND s.utm_campaign = ANY($3)
    GROUP BY s.utm_campaign
  `, [startTs, endTs, externalIds]);

  const result = new Map<string, OnPageFields>();
  for (const row of rows) {
    result.set(row.campaign_id, {
      pageViews: Number(row.page_views) || 0,
      uniqueVisitors: Number(row.unique_visitors) || 0,
      formViews: Number(row.form_views) || 0,
      formStarters: Number(row.form_starters) || 0,
      bounceRate: Number(row.bounce_rate) || 0,
      scrollPastHero: Number(row.scroll_past_hero) || 0,
      avgTimeOnPage: row.avg_time_on_page != null ? Number(row.avg_time_on_page) : null,
    });
  }
  return result;
}

/**
 * Per-ad landing page metrics grouped by utm_medium + url_path.
 * Replaces fetchAdLandingPages() in campaignPerformance.ts.
 */
export async function getTrackerAdLandingPages(
  campaignExternalId: string,
  dateRange: { start: Date; end: Date },
): Promise<Record<string, Array<{
  urlPath: string;
  pageViews: number;
  uniqueVisitors: number;
  bounceRate: number;
  scrollPastHero: number;
  scrollRate: number;
  formViews: number;
  formViewRate: number;
  formStarters: number;
  formStartRate: number;
  avgTimeOnPage: number | null;
}>>> {
  const startTs = formatLocalDate(dateRange.start) + 'T00:00:00';
  const endTs = formatLocalDate(dateRange.end) + 'T23:59:59.999';
  const activeTimeExpr = ACTIVE_TIME_EXPR;

  const rows = await executeQuery<{
    ad_id: string;
    url_path: string;
    page_views: string | number;
    unique_visitors: string | number;
    bounce_rate: string | number | null;
    scroll_past_hero: string | number;
    form_views: string | number;
    form_starters: string | number;
    avg_time_on_page: string | number | null;
  }>(`
    SELECT
      s.utm_medium AS ad_id,
      pv.url_path,
      COUNT(*) AS page_views,
      COUNT(DISTINCT s.visitor_id) AS unique_visitors,
      ROUND(
        COUNT(*) FILTER (WHERE ${activeTimeExpr} IS NOT NULL AND ${activeTimeExpr} < 5)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE ${activeTimeExpr} IS NOT NULL), 0), 4
      ) AS bounce_rate,
      COUNT(*) FILTER (WHERE COALESCE(ev.hero_scroll_passed, false) = true) AS scroll_past_hero,
      COUNT(*) FILTER (WHERE COALESCE(ev.form_view, false) = true) AS form_views,
      COUNT(*) FILTER (WHERE COALESCE(ev.form_started, false) = true) AS form_starters,
      ROUND(AVG(${activeTimeExpr})::numeric, 2) AS avg_time_on_page
    ${buildBaseFrom('tracker_page_views')}
    WHERE pv.viewed_at >= $1::timestamp AND pv.viewed_at <= $2::timestamp
      AND s.utm_campaign = $3
      AND s.utm_medium IS NOT NULL AND s.utm_medium != ''
    GROUP BY s.utm_medium, pv.url_path
    ORDER BY s.utm_medium, COUNT(*) DESC
  `, [startTs, endTs, campaignExternalId]);

  const result: Record<string, Array<{
    urlPath: string;
    pageViews: number;
    uniqueVisitors: number;
    bounceRate: number;
    scrollPastHero: number;
    scrollRate: number;
    formViews: number;
    formViewRate: number;
    formStarters: number;
    formStartRate: number;
    avgTimeOnPage: number | null;
  }>> = {};

  for (const row of rows) {
    const pageViews = Number(row.page_views) || 0;
    const scrollPastHero = Number(row.scroll_past_hero) || 0;
    const formViews = Number(row.form_views) || 0;
    const formStarters = Number(row.form_starters) || 0;
    const lp = {
      urlPath: row.url_path,
      pageViews,
      uniqueVisitors: Number(row.unique_visitors) || 0,
      bounceRate: Number(row.bounce_rate) || 0,
      scrollPastHero,
      scrollRate: pageViews > 0 ? scrollPastHero / pageViews : 0,
      formViews,
      formViewRate: pageViews > 0 ? formViews / pageViews : 0,
      formStarters,
      formStartRate: formViews > 0 ? formStarters / formViews : 0,
      avgTimeOnPage: row.avg_time_on_page != null ? Number(row.avg_time_on_page) : null,
    };
    if (!result[row.ad_id]) result[row.ad_id] = [];
    result[row.ad_id].push(lp);
  }
  return result;
}

/**
 * Distinct ff_funnel_id values for a campaign.
 * Replaces fetchFunnelFluxIds() in campaignPerformance.ts.
 */
export async function getTrackerFunnelFluxIds(
  campaignExternalId: string,
  dateRange: { start: Date; end: Date },
): Promise<string[]> {
  const startTs = formatLocalDate(dateRange.start) + 'T00:00:00';
  const endTs = formatLocalDate(dateRange.end) + 'T23:59:59.999';

  const rows = await executeQuery<{ ff_funnel_id: string }>(`
    SELECT DISTINCT s.ff_funnel_id
    FROM tracker_page_views pv
    JOIN tracker_sessions s ON pv.session_id = s.session_id
    WHERE pv.viewed_at >= $1::timestamp AND pv.viewed_at <= $2::timestamp
      AND s.utm_campaign = $3
      AND s.ff_funnel_id IS NOT NULL AND s.ff_funnel_id != ''
    LIMIT 10
  `, [startTs, endTs, campaignExternalId]);

  return rows.map(r => r.ff_funnel_id);
}
