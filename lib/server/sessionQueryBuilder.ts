import { formatLocalDate } from '@/lib/types/api';
import { validateSortDirection } from '@/lib/server/types';

/**
 * Dual-mode session query builder.
 *
 * Entry-level mode: queries session_entries (one row per session).
 * Funnel-level mode: queries event_page_view_enriched_v2 joined with
 *   matching sessions from session_entries via CTE.
 *
 * Mode detection:
 *   isFunnelMode = currentDimension === 'funnelStep' || 'funnelStep' in parentFilters
 */

type SqlParam = string | number;

interface QueryOptions {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  depth: number;
  parentFilters?: Record<string, string>;
  filters?: Array<{ field: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

const SESSION_TABLE = 'remote_session_tracker.session_entries';
const PAGE_VIEW_TABLE = 'remote_session_tracker.event_page_view_enriched_v2';

/** Maps frontend dimension IDs to session_entries columns */
const ENTRY_DIMENSION_MAP: Record<string, string> = {
  entryUrlPath: 'entry_url_path',
  entryPageType: 'entry_page_type',
  entryUtmSource: 'entry_utm_source',
  entryCampaign: 'entry_utm_campaign',
  entryAdset: 'entry_utm_content',
  entryAd: 'entry_utm_medium',
  entryUtmTerm: 'entry_utm_term',
  entryKeyword: 'entry_keyword',
  entryPlacement: 'entry_placement',
  entryReferrer: 'entry_referrer',
  funnelId: 'ff_funnel_id',
  entryCountryCode: 'entry_country_code',
  entryDeviceType: 'entry_device_type',
  entryOsName: 'entry_os_name',
  entryBrowserName: 'entry_browser_name',
  visitNumber: 'visit_number',
  date: 'session_start::date',
};

/**
 * Maps frontend dimension IDs to CTE-aliased columns for funnel-level queries.
 * Entry-level dims reference the CTE alias (ms.), funnelStep references pv.url_path.
 */
const FUNNEL_DIMENSION_MAP: Record<string, string> = {
  entryUrlPath: 'ms.entry_url_path',
  entryPageType: 'ms.entry_page_type',
  entryUtmSource: 'ms.entry_utm_source',
  entryCampaign: 'ms.entry_utm_campaign',
  entryAdset: 'ms.entry_utm_content',
  entryAd: 'ms.entry_utm_medium',
  entryUtmTerm: 'ms.entry_utm_term',
  entryKeyword: 'ms.entry_keyword',
  entryPlacement: 'ms.entry_placement',
  entryReferrer: 'ms.entry_referrer',
  funnelId: 'ms.ff_funnel_id',
  entryCountryCode: 'ms.entry_country_code',
  entryDeviceType: 'ms.entry_device_type',
  entryOsName: 'ms.entry_os_name',
  entryBrowserName: 'ms.entry_browser_name',
  visitNumber: 'ms.visit_number',
  funnelStep: "REGEXP_REPLACE(pv.url_path, '^https?://', '')",
  date: 'pv.created_at::date',
};

/** Bare column names for CTE SELECT (no table prefix, no cast) */
const CTE_COLUMN_MAP: Record<string, string> = {
  entryUrlPath: 'entry_url_path',
  entryPageType: 'entry_page_type',
  entryUtmSource: 'entry_utm_source',
  entryCampaign: 'entry_utm_campaign',
  entryAdset: 'entry_utm_content',
  entryAd: 'entry_utm_medium',
  entryUtmTerm: 'entry_utm_term',
  entryKeyword: 'entry_keyword',
  entryPlacement: 'entry_placement',
  entryReferrer: 'entry_referrer',
  funnelId: 'ff_funnel_id',
  entryCountryCode: 'entry_country_code',
  entryDeviceType: 'entry_device_type',
  entryOsName: 'entry_os_name',
  entryBrowserName: 'entry_browser_name',
  visitNumber: 'visit_number',
};

/** Metric IDs that can be sorted in SQL */
const SQL_SORTABLE_METRICS = new Set([
  'pageViews', 'uniqueVisitors', 'bounceRate', 'avgActiveTime',
  'scrollPastHero', 'scrollRate', 'formViews', 'formViewRate',
  'formStarters', 'formStartRate',
]);

/**
 * Enriched entry dimensions that have both IDs and names in merged_ads_spending.
 * Used for:
 * 1. Name-based table filtering (subquery fallback when filter value is a name)
 * 2. Name resolution in SELECT (LEFT JOIN to display names instead of raw IDs)
 */
const ENRICHED_ENTRY_DIMS: Record<string, {
  idColumn: string;       // merged_ads_spending ID column
  nameColumn: string;     // merged_ads_spending name column
  sessionColumn: string;  // session_entries column (raw ID)
  joinOn: string;         // JOIN ON clause (unaliased session_entries columns)
  distinctCols: string;   // DISTINCT columns for subquery
}> = {
  entryCampaign: {
    idColumn: 'campaign_id',
    nameColumn: 'campaign_name',
    sessionColumn: 'entry_utm_campaign',
    joinOn: 'entry_utm_campaign::text = mas.campaign_id::text',
    distinctCols: 'campaign_id, campaign_name',
  },
  entryAdset: {
    idColumn: 'adset_id',
    nameColumn: 'adset_name',
    sessionColumn: 'entry_utm_content',
    joinOn: 'entry_utm_campaign::text = mas.campaign_id::text AND entry_utm_content::text = mas.adset_id::text',
    distinctCols: 'campaign_id, adset_id, adset_name',
  },
  entryAd: {
    idColumn: 'ad_id',
    nameColumn: 'ad_name',
    sessionColumn: 'entry_utm_medium',
    joinOn: 'entry_utm_campaign::text = mas.campaign_id::text AND entry_utm_content::text = mas.adset_id::text AND entry_utm_medium::text = mas.ad_id::text',
    distinctCols: 'campaign_id, adset_id, ad_id, ad_name',
  },
};

/** Maps metric IDs to their SQL column alias for ORDER BY */
const METRIC_SQL_ALIAS: Record<string, string> = {
  pageViews: 'page_views',
  uniqueVisitors: 'unique_visitors',
  bounceRate: 'bounce_rate',
  avgActiveTime: 'avg_active_time',
  scrollPastHero: 'scroll_past_hero',
  scrollRate: 'scroll_rate',
  formViews: 'form_views',
  formViewRate: 'form_view_rate',
  formStarters: 'form_starters',
  formStartRate: 'form_start_rate',
};

class SessionQueryBuilder {
  buildQuery(options: QueryOptions): { query: string; params: SqlParam[] } {
    const { dimensions, depth, parentFilters } = options;

    const currentDimension = dimensions[depth];
    const isFunnelMode = currentDimension === 'funnelStep' ||
      (parentFilters != null && 'funnelStep' in parentFilters);

    if (isFunnelMode) {
      return this.buildFunnelQuery(options);
    }
    return this.buildEntryQuery(options);
  }

  /**
   * Entry-level query: aggregate session_entries with entry-page engagement metrics.
   */
  private buildEntryQuery(options: QueryOptions): { query: string; params: SqlParam[] } {
    const {
      dateRange,
      dimensions,
      depth,
      parentFilters,
      filters,
      sortBy = 'pageViews',
      sortDirection = 'DESC',
    } = options;

    const currentDimension = dimensions[depth];
    const sqlColumn = ENTRY_DIMENSION_MAP[currentDimension];
    if (!sqlColumn) {
      throw new Error(`Unknown session dimension: ${currentDimension}`);
    }

    const enriched = ENRICHED_ENTRY_DIMS[currentDimension];

    const params: SqlParam[] = [
      formatLocalDate(dateRange.start),
      formatLocalDate(dateRange.end),
    ];

    let whereClause = `WHERE session_start >= $1::date AND session_start < ($2::date + interval '1 day')`;

    if (parentFilters) {
      whereClause += this.buildEntryParentFilters(parentFilters, params);
    }

    if (filters && filters.length > 0) {
      whereClause += this.buildTableFilterClause(filters, params, ENTRY_DIMENSION_MAP);
    }

    const safeSortDir = validateSortDirection(sortDirection);
    const sortAlias = METRIC_SQL_ALIAS[sortBy];
    const orderBy = sortAlias && SQL_SORTABLE_METRICS.has(sortBy)
      ? `ORDER BY ${sortAlias} ${safeSortDir} NULLS LAST`
      : 'ORDER BY page_views DESC';

    // Enriched dimensions: JOIN to merged_ads_spending for name resolution
    const dimensionSelect = enriched
      ? `${enriched.sessionColumn}::text AS dimension_id,
        COALESCE(MAX(mas.${enriched.nameColumn}), ${enriched.sessionColumn}::text, 'Unknown') AS dimension_value`
      : `${sqlColumn} AS dimension_value`;

    const fromClause = enriched
      ? `FROM ${SESSION_TABLE}
      LEFT JOIN (
        SELECT DISTINCT ${enriched.distinctCols}
        FROM merged_ads_spending
        WHERE date::date BETWEEN $1::date AND $2::date
      ) mas ON ${enriched.joinOn}`
      : `FROM ${SESSION_TABLE}`;

    const groupByExpr = enriched ? enriched.sessionColumn : 'dimension_value';

    const query = `
      SELECT
        ${dimensionSelect},
        COUNT(*) AS page_views,
        COUNT(DISTINCT ff_visitor_id) AS unique_visitors,
        ROUND(
          COUNT(*) FILTER (WHERE entry_active_time_s IS NOT NULL AND entry_active_time_s < 5)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE entry_active_time_s IS NOT NULL), 0),
          4
        ) AS bounce_rate,
        ROUND(AVG(entry_active_time_s)::numeric, 2) AS avg_active_time,
        COUNT(*) FILTER (WHERE entry_hero_scroll_passed = true) AS scroll_past_hero,
        ROUND(
          COUNT(*) FILTER (WHERE entry_hero_scroll_passed = true)::numeric
          / NULLIF(COUNT(*), 0),
          4
        ) AS scroll_rate,
        COUNT(*) FILTER (WHERE entry_form_view = true) AS form_views,
        ROUND(
          COUNT(*) FILTER (WHERE entry_form_view = true)::numeric
          / NULLIF(COUNT(*), 0),
          4
        ) AS form_view_rate,
        COUNT(*) FILTER (WHERE entry_form_started = true) AS form_starters,
        ROUND(
          COUNT(*) FILTER (WHERE entry_form_started = true)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE entry_form_view = true), 0),
          4
        ) AS form_start_rate
      ${fromClause}
      ${whereClause}
      GROUP BY ${groupByExpr}
      HAVING COUNT(*) > 1
      ${orderBy}
      LIMIT 1000
    `;

    return { query, params };
  }

  /**
   * Funnel-level query: CTE selects matching sessions from session_entries,
   * then aggregates page views from event_page_view_enriched_v2.
   */
  private buildFunnelQuery(options: QueryOptions): { query: string; params: SqlParam[] } {
    const {
      dateRange,
      dimensions,
      depth,
      parentFilters,
      filters,
      sortBy = 'pageViews',
      sortDirection = 'DESC',
    } = options;

    const currentDimension = dimensions[depth];
    const funnelDimCol = FUNNEL_DIMENSION_MAP[currentDimension];
    if (!funnelDimCol) {
      throw new Error(`Unknown funnel dimension: ${currentDimension}`);
    }

    const params: SqlParam[] = [
      formatLocalDate(dateRange.start),
      formatLocalDate(dateRange.end),
    ];

    // Determine which entry-level columns the CTE needs to SELECT
    const cteColumns = new Set<string>(['session_id']);
    const cteEntryFilters: string[] = [];
    let funnelStepFilter = '';

    // Collect entry-level parent filters for CTE WHERE,
    // and funnelStep parent filter for main WHERE
    if (parentFilters) {
      for (const [dimId, value] of Object.entries(parentFilters)) {
        if (dimId === 'funnelStep') {
          params.push(value);
          funnelStepFilter = `AND REGEXP_REPLACE(pv.url_path, '^https?://', '') = $${params.length}`;
          continue;
        }
        const col = ENTRY_DIMENSION_MAP[dimId];
        if (!col) continue;
        if (value === 'Unknown' || value === '') {
          cteEntryFilters.push(`(${col} IS NULL OR ${col} = '')`);
        } else {
          params.push(value);
          cteEntryFilters.push(`${col} = $${params.length}`);
        }
      }
    }

    // If grouping by an entry-level dim (after funnelStep), pull it into CTE
    if (currentDimension !== 'funnelStep' && currentDimension !== 'date') {
      const cteCol = CTE_COLUMN_MAP[currentDimension];
      if (cteCol) {
        cteColumns.add(cteCol);
      }
    }

    const cteWhere = `WHERE se.session_start >= $1::date AND se.session_start < ($2::date + interval '1 day')` +
      (cteEntryFilters.length > 0 ? ' AND ' + cteEntryFilters.join(' AND ') : '');

    let mainTableFilters = '';
    if (filters && filters.length > 0) {
      mainTableFilters = this.buildTableFilterClause(filters, params, FUNNEL_DIMENSION_MAP);
    }

    const safeSortDir = validateSortDirection(sortDirection);
    const sortAlias = METRIC_SQL_ALIAS[sortBy];
    const orderBy = sortAlias && SQL_SORTABLE_METRICS.has(sortBy)
      ? `ORDER BY ${sortAlias} ${safeSortDir} NULLS LAST`
      : 'ORDER BY page_views DESC';

    const query = `
      WITH matching_sessions AS (
        SELECT ${Array.from(cteColumns).map(c => `se.${c}`).join(', ')}
        FROM ${SESSION_TABLE} se
        ${cteWhere}
      )
      SELECT
        ${funnelDimCol} AS dimension_value,
        COUNT(*) AS page_views,
        COUNT(DISTINCT pv.ff_visitor_id) AS unique_visitors,
        ROUND(
          COUNT(*) FILTER (WHERE pv.active_time_s IS NOT NULL AND pv.active_time_s < 5)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE pv.active_time_s IS NOT NULL), 0),
          4
        ) AS bounce_rate,
        ROUND(AVG(pv.active_time_s)::numeric, 2) AS avg_active_time,
        COUNT(*) FILTER (WHERE pv.hero_scroll_passed = true) AS scroll_past_hero,
        ROUND(
          COUNT(*) FILTER (WHERE pv.hero_scroll_passed = true)::numeric
          / NULLIF(COUNT(*), 0),
          4
        ) AS scroll_rate,
        COUNT(*) FILTER (WHERE pv.form_view = true) AS form_views,
        ROUND(
          COUNT(*) FILTER (WHERE pv.form_view = true)::numeric
          / NULLIF(COUNT(*), 0),
          4
        ) AS form_view_rate,
        COUNT(*) FILTER (WHERE pv.form_started = true) AS form_starters,
        ROUND(
          COUNT(*) FILTER (WHERE pv.form_started = true)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE pv.form_view = true), 0),
          4
        ) AS form_start_rate
      FROM ${PAGE_VIEW_TABLE} pv
      JOIN matching_sessions ms ON pv.session_id = ms.session_id
      WHERE pv.created_at >= $1::date AND pv.created_at < ($2::date + interval '1 day')
        ${funnelStepFilter}
        ${mainTableFilters}
      GROUP BY dimension_value
      ${orderBy}
      LIMIT 1000
    `;

    return { query, params };
  }

  /**
   * Build parent filter clauses for entry-level queries (session_entries).
   */
  private buildEntryParentFilters(
    parentFilters: Record<string, string>,
    params: SqlParam[]
  ): string {
    let clause = '';
    for (const [dimId, value] of Object.entries(parentFilters)) {
      const col = ENTRY_DIMENSION_MAP[dimId];
      if (!col) continue;
      if (value === 'Unknown' || value === '') {
        clause += ` AND (${col} IS NULL OR ${col} = '')`;
      } else {
        params.push(value);
        clause += ` AND ${col} = $${params.length}`;
      }
    }
    return clause;
  }

  /**
   * Build table filter clauses for queries.
   * Same field = OR, different fields = AND.
   * For enriched entry dimensions (campaign/adset/ad), generates OR conditions
   * to match by both raw ID and name (via merged_ads_spending subquery).
   */
  private buildTableFilterClause(
    filters: Array<{ field: string; operator: string; value: string }>,
    params: SqlParam[],
    dimensionMap: Record<string, string>
  ): string {
    const byField = new Map<string, Array<{ operator: string; value: string }>>();
    for (const f of filters) {
      const col = dimensionMap[f.field];
      if (!col) continue;
      if (!byField.has(f.field)) byField.set(f.field, []);
      byField.get(f.field)!.push({ operator: f.operator, value: f.value });
    }

    let clause = '';
    for (const [field, conditions] of byField) {
      const col = dimensionMap[field]!;
      const enriched = ENRICHED_ENTRY_DIMS[field];
      const orParts: string[] = [];
      for (const { operator, value } of conditions) {
        params.push(value);
        const paramRef = `$${params.length}`;
        // Subquery to resolve name → ID for enriched dimensions
        const nameSubquery = enriched
          ? `SELECT DISTINCT ${enriched.idColumn}::text FROM merged_ads_spending WHERE date::date BETWEEN $1::date AND $2::date AND LOWER(${enriched.nameColumn}) = LOWER(${paramRef})`
          : null;
        switch (operator) {
          case 'equals':
            if (nameSubquery) {
              orParts.push(`(LOWER(${col}::text) = LOWER(${paramRef}) OR ${col}::text IN (${nameSubquery}))`);
            } else {
              orParts.push(`LOWER(${col}::text) = LOWER(${paramRef})`);
            }
            break;
          case 'not_equals':
            if (nameSubquery) {
              orParts.push(`(LOWER(${col}::text) != LOWER(${paramRef}) AND ${col}::text NOT IN (${nameSubquery}))`);
            } else {
              orParts.push(`LOWER(${col}::text) != LOWER(${paramRef})`);
            }
            break;
          case 'contains':
            if (enriched) {
              const nameContainsSubquery = `SELECT DISTINCT ${enriched.idColumn}::text FROM merged_ads_spending WHERE date::date BETWEEN $1::date AND $2::date AND LOWER(${enriched.nameColumn}) LIKE '%' || LOWER(${paramRef}) || '%'`;
              orParts.push(`(LOWER(${col}::text) LIKE '%' || LOWER(${paramRef}) || '%' OR ${col}::text IN (${nameContainsSubquery}))`);
            } else {
              orParts.push(`LOWER(${col}::text) LIKE '%' || LOWER(${paramRef}) || '%'`);
            }
            break;
          case 'not_contains':
            if (enriched) {
              const nameNotContainsSubquery = `SELECT DISTINCT ${enriched.idColumn}::text FROM merged_ads_spending WHERE date::date BETWEEN $1::date AND $2::date AND LOWER(${enriched.nameColumn}) LIKE '%' || LOWER(${paramRef}) || '%'`;
              orParts.push(`(LOWER(${col}::text) NOT LIKE '%' || LOWER(${paramRef}) || '%' AND ${col}::text NOT IN (${nameNotContainsSubquery}))`);
            } else {
              orParts.push(`LOWER(${col}::text) NOT LIKE '%' || LOWER(${paramRef}) || '%'`);
            }
            break;
        }
      }
      if (orParts.length > 0) {
        clause += ` AND (${orParts.join(' OR ')})`;
      }
    }

    return clause;
  }
}

export const sessionQueryBuilder = new SessionQueryBuilder();
