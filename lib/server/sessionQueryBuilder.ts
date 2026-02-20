import { formatLocalDate } from '@/lib/types/api';

/**
 * Flat session query builder.
 *
 * Returns all data grouped by ALL selected dimensions in a single query.
 * Each row contains dimension values + base metric counts.
 * The client builds the hierarchical tree and computes derived metrics.
 *
 * Dual-mode:
 *   Entry mode (default): queries session_entries (one row per session).
 *   Funnel mode: CTE selects matching sessions, then queries page views.
 *   Mode detection: isFunnelMode = 'funnelStep' in dimensions
 */

type SqlParam = string | number;

export interface FlatQueryOptions {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  filters?: Array<{ field: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>;
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
 * Enriched entry dimensions that have both IDs and names in marketing_merged_ads_spending.
 * Each gets two columns in the flat result: _id (raw tracking ID) + display name.
 */
const ENRICHED_ENTRY_DIMS: Record<string, {
  idColumn: string;
  nameColumn: string;
  sessionColumn: string;
  joinOn: string;
  distinctCols: string;
}> = {
  entryCampaign: {
    idColumn: 'campaign_id',
    nameColumn: 'campaign_name',
    sessionColumn: 'entry_utm_campaign',
    joinOn: 'se.entry_utm_campaign::text = mas.campaign_id::text',
    distinctCols: 'campaign_id, campaign_name',
  },
  entryAdset: {
    idColumn: 'adset_id',
    nameColumn: 'adset_name',
    sessionColumn: 'entry_utm_content',
    joinOn: 'se.entry_utm_campaign::text = mas.campaign_id::text AND se.entry_utm_content::text = mas.adset_id::text',
    distinctCols: 'campaign_id, adset_id, adset_name',
  },
  entryAd: {
    idColumn: 'ad_id',
    nameColumn: 'ad_name',
    sessionColumn: 'entry_utm_medium',
    joinOn: 'se.entry_utm_campaign::text = mas.campaign_id::text AND se.entry_utm_content::text = mas.adset_id::text AND se.entry_utm_medium::text = mas.ad_id::text',
    distinctCols: 'campaign_id, adset_id, ad_id, ad_name',
  },
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

class SessionQueryBuilder {
  /**
   * Build a flat query that groups by ALL selected dimensions simultaneously.
   * Returns raw metric counts (not pre-computed ratios) for correct client-side aggregation.
   */
  buildFlatQuery(options: FlatQueryOptions): { query: string; params: SqlParam[] } {
    const { dimensions } = options;
    const isFunnelMode = dimensions.includes('funnelStep');

    if (isFunnelMode) {
      return this.buildFlatFunnelQuery(options);
    }
    return this.buildFlatEntryQuery(options);
  }

  /**
   * Entry-level flat query: GROUP BY all selected dimensions on session_entries.
   */
  private buildFlatEntryQuery(options: FlatQueryOptions): { query: string; params: SqlParam[] } {
    const { dateRange, dimensions, filters } = options;

    const params: SqlParam[] = [
      formatLocalDate(dateRange.start),
      formatLocalDate(dateRange.end),
    ];

    // Determine which enriched dims are needed (for JOIN)
    const enrichedDims = dimensions.filter(d => d in ENRICHED_ENTRY_DIMS);
    const needsJoin = enrichedDims.length > 0;

    // Build SELECT and GROUP BY for every dimension
    const selectParts: string[] = [];
    const groupByParts: string[] = [];

    for (const dim of dimensions) {
      const enriched = ENRICHED_ENTRY_DIMS[dim];
      if (enriched) {
        // Enriched: two columns — raw ID for key + display name
        selectParts.push(`se.${enriched.sessionColumn}::text AS "_${dim}_id"`);
        selectParts.push(
          `COALESCE(MAX(mas.${enriched.nameColumn}), se.${enriched.sessionColumn}::text, 'Unknown') AS "${dim}"`
        );
        groupByParts.push(`se.${enriched.sessionColumn}`);
      } else {
        const col = ENTRY_DIMENSION_MAP[dim];
        if (!col) throw new Error(`Unknown session dimension: ${dim}`);
        selectParts.push(`${col} AS "${dim}"`);
        groupByParts.push(col === 'session_start::date' ? col : `"${dim}"`);
      }
    }

    // WHERE clause
    let whereClause = `WHERE se.session_start >= $1::date AND se.session_start < ($2::date + interval '1 day')`;

    if (filters && filters.length > 0) {
      whereClause += this.buildTableFilterClause(filters, params, ENTRY_DIMENSION_MAP, 'se');
    }

    // FROM clause with optional JOIN
    let fromClause = `FROM ${SESSION_TABLE} se`;
    if (needsJoin) {
      // Find the most specific enriched dim to determine JOIN conditions
      const joinConfig = this.buildEnrichedJoin(enrichedDims);
      fromClause += `
      LEFT JOIN (
        SELECT DISTINCT ${joinConfig.distinctCols}
        FROM marketing_merged_ads_spending
        WHERE date::date BETWEEN $1::date AND $2::date
      ) mas ON ${joinConfig.joinOn}`;
    }

    const query = `
      SELECT
        ${selectParts.join(',\n        ')},
        COUNT(*) AS page_views,
        COUNT(DISTINCT se.ff_visitor_id) AS unique_visitors,
        COUNT(*) FILTER (WHERE se.entry_active_time_s IS NOT NULL AND se.entry_active_time_s < 5) AS bounced_count,
        COUNT(*) FILTER (WHERE se.entry_active_time_s IS NOT NULL) AS active_time_count,
        COALESCE(SUM(se.entry_active_time_s), 0) AS total_active_time,
        COUNT(*) FILTER (WHERE se.entry_hero_scroll_passed = true) AS scroll_past_hero,
        COUNT(*) FILTER (WHERE se.entry_form_view = true) AS form_views,
        COUNT(*) FILTER (WHERE se.entry_form_started = true) AS form_starters
      ${fromClause}
      ${whereClause}
      GROUP BY ${groupByParts.join(', ')}
      HAVING COUNT(*) > 1
    `;

    return { query, params };
  }

  /**
   * Funnel-level flat query: CTE selects matching sessions from session_entries,
   * then aggregates page views grouped by ALL dimensions simultaneously.
   */
  private buildFlatFunnelQuery(options: FlatQueryOptions): { query: string; params: SqlParam[] } {
    const { dateRange, dimensions, filters } = options;

    const params: SqlParam[] = [
      formatLocalDate(dateRange.start),
      formatLocalDate(dateRange.end),
    ];

    // Determine which entry-level columns the CTE needs to SELECT
    const cteColumns = new Set<string>(['session_id']);
    for (const dim of dimensions) {
      if (dim === 'funnelStep' || dim === 'date') continue;
      const cteCol = CTE_COLUMN_MAP[dim];
      if (cteCol) cteColumns.add(cteCol);
    }

    // Build SELECT and GROUP BY for every dimension
    const selectParts: string[] = [];
    const groupByParts: string[] = [];

    for (const dim of dimensions) {
      const funnelCol = FUNNEL_DIMENSION_MAP[dim];
      if (!funnelCol) throw new Error(`Unknown funnel dimension: ${dim}`);

      selectParts.push(`${funnelCol} AS "${dim}"`);

      // GROUP BY expression: for computed expressions use the alias
      if (dim === 'funnelStep') {
        groupByParts.push(funnelCol);
      } else if (dim === 'date') {
        groupByParts.push(funnelCol);
      } else {
        groupByParts.push(`"${dim}"`);
      }
    }

    // CTE WHERE for entry-level filters
    let cteFilterClause = '';
    if (filters && filters.length > 0) {
      // Separate entry-level filters (for CTE) from funnel-level filters
      const entryFilters = filters.filter(f => f.field !== 'funnelStep');
      if (entryFilters.length > 0) {
        cteFilterClause = this.buildTableFilterClause(entryFilters, params, ENTRY_DIMENSION_MAP, 'se');
      }
    }

    // Main WHERE for funnelStep filter + page view filters
    let mainFilterClause = '';
    if (filters && filters.length > 0) {
      const funnelFilters = filters.filter(f => f.field === 'funnelStep');
      if (funnelFilters.length > 0) {
        mainFilterClause = this.buildTableFilterClause(funnelFilters, params, FUNNEL_DIMENSION_MAP, '');
      }
    }

    const cteWhere = `WHERE se.session_start >= $1::date AND se.session_start < ($2::date + interval '1 day')${cteFilterClause}`;

    const query = `
      WITH matching_sessions AS (
        SELECT ${Array.from(cteColumns).map(c => `se.${c}`).join(', ')}
        FROM ${SESSION_TABLE} se
        ${cteWhere}
      )
      SELECT
        ${selectParts.join(',\n        ')},
        COUNT(*) AS page_views,
        COUNT(DISTINCT pv.ff_visitor_id) AS unique_visitors,
        COUNT(*) FILTER (WHERE pv.active_time_s IS NOT NULL AND pv.active_time_s < 5) AS bounced_count,
        COUNT(*) FILTER (WHERE pv.active_time_s IS NOT NULL) AS active_time_count,
        COALESCE(SUM(pv.active_time_s), 0) AS total_active_time,
        COUNT(*) FILTER (WHERE pv.hero_scroll_passed = true) AS scroll_past_hero,
        COUNT(*) FILTER (WHERE pv.form_view = true) AS form_views,
        COUNT(*) FILTER (WHERE pv.form_started = true) AS form_starters
      FROM ${PAGE_VIEW_TABLE} pv
      JOIN matching_sessions ms ON pv.session_id = ms.session_id
      WHERE pv.created_at >= $1::date AND pv.created_at < ($2::date + interval '1 day')
        ${mainFilterClause}
      GROUP BY ${groupByParts.join(', ')}
    `;

    return { query, params };
  }

  /**
   * Build the enriched JOIN needed for the selected dimensions.
   * Collects ALL columns needed by ALL enriched dims, using the most specific JOIN ON.
   * e.g. campaign+adset needs: campaign_id, campaign_name, adset_id, adset_name
   */
  private buildEnrichedJoin(enrichedDims: string[]): { distinctCols: string; joinOn: string } {
    // Collect all needed columns from all enriched dims
    const colSet = new Set<string>();
    for (const dim of enrichedDims) {
      const config = ENRICHED_ENTRY_DIMS[dim];
      for (const col of config.distinctCols.split(', ')) {
        colSet.add(col.trim());
      }
      // Also add the name column for dims that reference it via MAX()
      colSet.add(config.nameColumn);
    }

    // Use the most specific JOIN ON (ad > adset > campaign)
    let joinOn: string;
    if (enrichedDims.includes('entryAd')) {
      joinOn = ENRICHED_ENTRY_DIMS.entryAd.joinOn;
    } else if (enrichedDims.includes('entryAdset')) {
      joinOn = ENRICHED_ENTRY_DIMS.entryAdset.joinOn;
    } else {
      joinOn = ENRICHED_ENTRY_DIMS.entryCampaign.joinOn;
    }

    return { distinctCols: Array.from(colSet).join(', '), joinOn };
  }

  /**
   * Build table filter clauses.
   * Same field = OR, different fields = AND.
   * For enriched entry dimensions (campaign/adset/ad), generates OR conditions
   * to match by both raw ID and name (via marketing_merged_ads_spending subquery).
   */
  private buildTableFilterClause(
    filters: Array<{ field: string; operator: string; value: string }>,
    params: SqlParam[],
    dimensionMap: Record<string, string>,
    tableAlias: string
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
      let col = dimensionMap[field]!;
      // Add table alias prefix if not already prefixed
      if (tableAlias && !col.includes('.') && !col.includes('(')) {
        col = `${tableAlias}.${col}`;
      }
      const enriched = ENRICHED_ENTRY_DIMS[field];
      const orParts: string[] = [];
      for (const { operator, value } of conditions) {
        params.push(value);
        const paramRef = `$${params.length}`;
        const nameSubquery = enriched
          ? `SELECT DISTINCT ${enriched.idColumn}::text FROM marketing_merged_ads_spending WHERE date::date BETWEEN $1::date AND $2::date AND LOWER(${enriched.nameColumn}) = LOWER(${paramRef})`
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
              const nameContainsSubquery = `SELECT DISTINCT ${enriched.idColumn}::text FROM marketing_merged_ads_spending WHERE date::date BETWEEN $1::date AND $2::date AND LOWER(${enriched.nameColumn}) LIKE '%' || LOWER(${paramRef}) || '%'`;
              orParts.push(`(LOWER(${col}::text) LIKE '%' || LOWER(${paramRef}) || '%' OR ${col}::text IN (${nameContainsSubquery}))`);
            } else {
              orParts.push(`LOWER(${col}::text) LIKE '%' || LOWER(${paramRef}) || '%'`);
            }
            break;
          case 'not_contains':
            if (enriched) {
              const nameNotContainsSubquery = `SELECT DISTINCT ${enriched.idColumn}::text FROM marketing_merged_ads_spending WHERE date::date BETWEEN $1::date AND $2::date AND LOWER(${enriched.nameColumn}) LIKE '%' || LOWER(${paramRef}) || '%'`;
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
