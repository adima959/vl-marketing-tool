import type { QueryOptions } from './types';
import { validateSortDirection } from './types';

/**
 * Format a Date as 'YYYY-MM-DD' using local timezone
 * Avoids the timezone bug where toISOString().split('T')[0] returns
 * the previous day for users ahead of UTC (e.g., Europe)
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Builds dynamic SQL queries for on-page analytics reporting
 * Table: remote_session_tracker.event_page_view_enriched_v2
 */
export class OnPageQueryBuilder {
  /**
   * Maps frontend dimension IDs to database column names
   * url_path is already normalized in the materialized view (no # or ? params)
   */
  private readonly dimensionMap: Record<string, string> = {
    urlPath: 'url_path',
    pageType: 'page_type',
    utmSource: 'LOWER(utm_source)',
    campaign: 'utm_campaign',
    adset: 'adset_id',
    ad: 'ad_id',
    webmasterId: 'utm_medium',
    funnelId: 'ff_funnel_id',
    utmTerm: 'utm_term',
    keyword: 'keyword',
    placement: 'placement',
    referrer: 'referrer',
    deviceType: 'device_type',
    osName: 'os_name',
    browserName: 'browser_name',
    countryCode: 'country_code',
    timezone: 'timezone',
    visitNumber: 'visit_number',
    localHour: 'local_hour_of_day',
    date: "created_at::date",
    // Classification dims — actual expressions come from classificationDims
    classifiedProduct: '__classification__',
    classifiedCountry: '__classification__',
  };

  /**
   * Enriched dimensions that produce a dimension_id column alongside dimension_value.
   * - dimColumnPrefix: table prefix for SELECT/GROUP BY (mas. = from spending table)
   * - parentFilterExpr: SQL expression to use when this dimension appears in parent filters
   * - joinLevel: determines how specific the JOIN subquery needs to be
   */
  private readonly enrichedDimensions: Record<string, {
    nameExpression: string;
    needsJoin: boolean;
    dimColumnPrefix: string;
    parentFilterExpr: string;
    joinLevel: 'campaign' | 'adset' | 'ad';
  }> = {
    campaign: {
      nameExpression: 'MAX(mas.campaign_name)',
      needsJoin: true,
      dimColumnPrefix: 'pv.',
      parentFilterExpr: 'pv.utm_campaign::text',
      joinLevel: 'campaign',
    },
    adset: {
      nameExpression: 'MAX(mas.adset_name)',
      needsJoin: true,
      dimColumnPrefix: 'mas.',
      parentFilterExpr: 'mas.adset_id::text',  // Use mas.adset_id when adset is a parent filter
      joinLevel: 'adset',
    },
    ad: {
      nameExpression: 'MAX(mas.ad_name)',
      needsJoin: true,
      dimColumnPrefix: 'mas.',
      parentFilterExpr: 'mas.ad_id::text',
      joinLevel: 'ad',
    },
  };

  /**
   * Classification dimensions requiring JOINs to app_url_classifications + app_products.
   * Separate from enrichedDimensions because these use a different JOIN target.
   */
  private readonly classificationDims: Record<string, {
    selectExpr: string;
    groupByExpr: string;
    /** Used for parent drill-down filters (matches against the ID/key) */
    parentFilterExpr: string;
    /** Used for user-typed table filters (matches against the display name) */
    tableFilterExpr: string;
    nameExpr?: string;
  }> = {
    classifiedProduct: {
      selectExpr: 'ap.id::text',
      groupByExpr: 'ap.id',
      parentFilterExpr: 'ap.id::text',
      tableFilterExpr: 'ap.name',
      nameExpr: 'MAX(ap.name)',
    },
    classifiedCountry: {
      selectExpr: 'uc.country_code',
      groupByExpr: 'uc.country_code',
      parentFilterExpr: 'uc.country_code',
      tableFilterExpr: 'uc.country_code',
    },
  };

  /**
   * Applies a table prefix to a column expression, handling function wrappers.
   * e.g., prefixColumn('LOWER(utm_source)', 'pv.') → 'LOWER(pv.utm_source)'
   *       prefixColumn('url_path', 'pv.') → 'pv.url_path'
   */
  private prefixColumn(expr: string, prefix: string): string {
    if (!prefix) return expr;
    const funcMatch = expr.match(/^(\w+)\((.+)\)$/);
    if (funcMatch) {
      return `${funcMatch[1]}(${prefix}${funcMatch[2]})`;
    }
    return `${prefix}${expr}`;
  }

  /**
   * Maps frontend metric IDs to SQL aggregation expressions
   */
  private readonly metricMap: Record<string, string> = {
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

  /**
   * Builds parent filter WHERE clause
   * Handles "Unknown" values by converting them to IS NULL conditions
   */
  private buildParentFilters(
    parentFilters: Record<string, string> | undefined,
    paramOffset: number,
    columnPrefix: string = ''
  ): { whereClause: string; params: (string | number | boolean | null | Date)[] } {
    if (!parentFilters || Object.keys(parentFilters).length === 0) {
      return { whereClause: '', params: [] };
    }

    const params: (string | number | boolean | null | Date)[] = [];
    const conditions: string[] = [];

    Object.entries(parentFilters).forEach(([dimId, value]) => {
      // Classification dims use their own filter expressions (from JOINed tables)
      const classifDim = this.classificationDims[dimId];
      if (classifDim) {
        if (value === 'Unknown') {
          conditions.push(`${classifDim.parentFilterExpr} IS NULL`);
        } else {
          params.push(value);
          conditions.push(`${classifDim.parentFilterExpr} = $${paramOffset + params.length}`);
        }
        return;
      }

      const sqlColumn = this.dimensionMap[dimId];
      if (!sqlColumn) {
        throw new Error(`Unknown dimension in parent filter: ${dimId}`);
      }

      // Handle "Unknown" values as NULL
      if (value === 'Unknown') {
        if (dimId === 'date') {
          conditions.push(`${columnPrefix}created_at::date IS NULL`);
        } else if (this.enrichedDimensions[dimId]) {
          const dimEnriched = this.enrichedDimensions[dimId];
          conditions.push(`${dimEnriched.parentFilterExpr} IS NULL`);
        } else {
          conditions.push(`${this.prefixColumn(sqlColumn, columnPrefix)} IS NULL`);
        }
      } else {
        params.push(value);
        if (dimId === 'date') {
          conditions.push(`${columnPrefix}created_at::date = $${paramOffset + params.length}`);
        } else if (this.enrichedDimensions[dimId]) {
          const dimEnriched = this.enrichedDimensions[dimId];
          conditions.push(`${dimEnriched.parentFilterExpr} = $${paramOffset + params.length}`);
        } else {
          conditions.push(`${this.prefixColumn(sqlColumn, columnPrefix)} = $${paramOffset + params.length}`);
        }
      }
    });

    return {
      whereClause: `AND ${conditions.join(' AND ')}`,
      params,
    };
  }

  /**
   * Resolves a filter field to its SQL column expression.
   */
  private resolveFilterCol(
    field: string,
    columnPrefix: string
  ): { colExpr: string; textExpr: string } | null {
    const classifDim = this.classificationDims[field];
    if (classifDim) {
      return { colExpr: classifDim.tableFilterExpr, textExpr: `${classifDim.tableFilterExpr}::text` };
    }
    const sqlColumn = this.dimensionMap[field];
    if (!sqlColumn) return null;
    const enriched = this.enrichedDimensions[field];
    const colExpr = enriched
      ? enriched.parentFilterExpr
      : (field === 'date' ? `${columnPrefix}created_at::date` : this.prefixColumn(sqlColumn, columnPrefix));
    return { colExpr, textExpr: `${colExpr}::text` };
  }

  /**
   * Builds a single SQL condition for one filter, case-insensitive.
   */
  private buildFilterCondition(
    filter: { operator: string; value: string },
    colExpr: string,
    textExpr: string,
    params: any[],
    paramOffset: number
  ): string | null {
    switch (filter.operator) {
      case 'equals':
        if (!filter.value) return `${colExpr} IS NULL`;
        params.push(filter.value);
        return `LOWER(${textExpr}) = LOWER($${paramOffset + params.length})`;
      case 'not_equals':
        if (!filter.value) return `${colExpr} IS NOT NULL`;
        params.push(filter.value);
        return `(${colExpr} IS NULL OR LOWER(${textExpr}) != LOWER($${paramOffset + params.length}))`;
      case 'contains':
        params.push(`%${filter.value}%`);
        return `${textExpr} ILIKE $${paramOffset + params.length}`;
      case 'not_contains':
        params.push(`%${filter.value}%`);
        return `(${colExpr} IS NULL OR ${textExpr} NOT ILIKE $${paramOffset + params.length})`;
      default:
        return null;
    }
  }

  /**
   * Builds top-level dimension filter WHERE clauses from user-defined filters.
   * Same-field filters are OR'd together, different fields are AND'd.
   * All equals/not_equals comparisons are case-insensitive.
   */
  private buildTableFilters(
    filters: QueryOptions['filters'],
    paramOffset: number,
    columnPrefix: string = ''
  ): { whereClause: string; params: any[] } {
    if (!filters || filters.length === 0) {
      return { whereClause: '', params: [] };
    }

    const params: any[] = [];

    // Group filters by field, preserving resolution info
    const fieldGroups = new Map<string, { colExpr: string; textExpr: string; filters: Array<{ operator: string; value: string }> }>();

    for (const filter of filters) {
      if (!filter.value && filter.operator !== 'equals' && filter.operator !== 'not_equals') continue;
      const resolved = this.resolveFilterCol(filter.field, columnPrefix);
      if (!resolved) continue;

      const group = fieldGroups.get(filter.field);
      if (group) {
        group.filters.push({ operator: filter.operator, value: filter.value });
      } else {
        fieldGroups.set(filter.field, { ...resolved, filters: [{ operator: filter.operator, value: filter.value }] });
      }
    }

    // Build conditions: OR within each field, AND between fields
    const fieldConditions: string[] = [];

    for (const [, group] of fieldGroups) {
      const subconditions: string[] = [];
      for (const f of group.filters) {
        const cond = this.buildFilterCondition(f, group.colExpr, group.textExpr, params, paramOffset);
        if (cond) subconditions.push(cond);
      }
      if (subconditions.length === 0) continue;
      if (subconditions.length === 1) {
        fieldConditions.push(subconditions[0]);
      } else {
        fieldConditions.push(`(${subconditions.join(' OR ')})`);
      }
    }

    if (fieldConditions.length === 0) return { whereClause: '', params: [] };

    return {
      whereClause: `AND ${fieldConditions.join(' AND ')}`,
      params,
    };
  }

  /**
   * Builds the complete query for a given depth and filters
   */
  public buildQuery(options: QueryOptions): { query: string; params: any[] } {
    const {
      dateRange,
      dimensions,
      depth,
      parentFilters,
      filters,
      sortBy = 'pageViews',
      sortDirection = 'DESC',
      limit = 1000,
    } = options;

    // Validate depth
    if (depth >= dimensions.length) {
      throw new Error(`Depth ${depth} exceeds dimensions length ${dimensions.length}`);
    }

    // Validate limit
    const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));

    // Get current dimension
    const currentDimension = dimensions[depth];
    const sqlColumn = this.dimensionMap[currentDimension];

    if (!sqlColumn) {
      throw new Error(`Unknown dimension: ${currentDimension}`);
    }

    // Determine if this is an enriched dimension and what JOIN level is needed
    const enriched = this.enrichedDimensions[currentDimension];
    const classifDim = this.classificationDims[currentDimension];
    const filterDims = (filters || []).map(f => f.field);
    const allInvolvedDims = [currentDimension, ...Object.keys(parentFilters || {}), ...filterDims];
    const involvedEnriched = allInvolvedDims
      .map((d) => this.enrichedDimensions[d])
      .filter(Boolean);

    // Determine the deepest JOIN level needed
    const joinLevelOrder = { campaign: 1, adset: 2, ad: 3 };
    let joinLevel: 'campaign' | 'adset' | 'ad' | null = null;
    for (const dim of involvedEnriched) {
      if (!joinLevel || joinLevelOrder[dim.joinLevel] > joinLevelOrder[joinLevel]) {
        joinLevel = dim.joinLevel;
      }
    }

    // Check if classification JOIN is needed (product/market dimensions)
    const needsClassificationJoin = allInvolvedDims.some(d => this.classificationDims[d] != null);

    const anyJoinNeeded = joinLevel !== null || needsClassificationJoin;
    const tableAlias = anyJoinNeeded ? 'pv' : '';
    const columnPrefix = tableAlias ? `${tableAlias}.` : '';

    // For SELECT/GROUP BY: classification dims use their own expressions
    let selectExpression: string;
    let groupByExpression: string;
    if (classifDim) {
      selectExpression = classifDim.selectExpr;
      groupByExpression = classifDim.groupByExpr;
    } else {
      const dimPrefix = enriched?.dimColumnPrefix ?? columnPrefix;
      selectExpression = currentDimension === 'date'
        ? `${columnPrefix}created_at::date`
        : this.prefixColumn(sqlColumn, dimPrefix);
      groupByExpression = selectExpression;
    }

    // Get sort column
    const sortColumn = this.metricMap[sortBy] || 'page_views';
    const finalSortColumn = currentDimension === 'date' ? 'dimension_value' : sortColumn;
    const finalSortDirection = currentDimension === 'date' ? 'DESC' : validateSortDirection(sortDirection);

    // Build parameters
    const params: any[] = [
      formatLocalDate(dateRange.start), // $1
      formatLocalDate(dateRange.end),   // $2
    ];

    // Build parent filters (drill-down)
    const { whereClause, params: filterParams } = this.buildParentFilters(
      parentFilters,
      params.length,
      columnPrefix
    );
    params.push(...filterParams);

    // Build table filters (user-defined WHERE clauses)
    const { whereClause: tableFilterClause, params: tableFilterParams } = this.buildTableFilters(
      filters,
      params.length,
      columnPrefix
    );
    params.push(...tableFilterParams);

    // Build SELECT columns for dimension
    let dimensionSelect: string;
    if (classifDim) {
      if (classifDim.nameExpr) {
        // Product: show name as value, id as dimension_id
        dimensionSelect = `
        ${selectExpression} AS dimension_id,
        COALESCE(${classifDim.nameExpr}, 'Unknown') AS dimension_value`;
      } else {
        // Market: just the value
        dimensionSelect = `${selectExpression} AS dimension_value`;
      }
    } else if (enriched) {
      dimensionSelect = `
        ${selectExpression}::text AS dimension_id,
        COALESCE(${enriched.nameExpression} || ' (' || ${selectExpression}::text || ')', COALESCE(${selectExpression}::text, 'Unknown')) AS dimension_value`;
    } else {
      dimensionSelect = `${selectExpression} AS dimension_value`;
    }

    // Build FROM clause with JOINs tailored to what's needed
    let fromClause: string;
    if (joinLevel) {
      let distinctColumns: string;
      let extraJoinCondition = '';

      switch (joinLevel) {
        case 'campaign':
          distinctColumns = 'campaign_id, campaign_name';
          break;
        case 'adset':
          distinctColumns = 'campaign_id, campaign_name, adset_id, adset_name';
          extraJoinCondition = ' AND pv.utm_content::text = mas.adset_id::text';
          break;
        case 'ad':
          distinctColumns = 'campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name';
          extraJoinCondition = ' AND pv.utm_content::text = mas.adset_id::text AND pv.utm_medium::text = mas.ad_id::text';
          break;
      }

      fromClause = `
      FROM remote_session_tracker.event_page_view_enriched_v2 pv
      LEFT JOIN (
        SELECT DISTINCT ${distinctColumns} FROM merged_ads_spending
        WHERE date::date BETWEEN $1::date AND $2::date
      ) mas ON pv.utm_campaign::text = mas.campaign_id::text${extraJoinCondition}`;
    } else if (needsClassificationJoin) {
      fromClause = `
      FROM remote_session_tracker.event_page_view_enriched_v2 pv`;
    } else {
      fromClause = `FROM remote_session_tracker.event_page_view_enriched_v2`;
    }

    // Append classification JOINs when needed
    // url_path is already normalized in the view, so direct comparison is fine
    if (needsClassificationJoin) {
      fromClause += `
      LEFT JOIN app_url_classifications uc ON ${columnPrefix}url_path = uc.url_path AND uc.is_ignored = false
      LEFT JOIN app_products ap ON uc.product_id = ap.id`;
    }

    // Column references need prefix when using table alias
    const colRef = (col: string) => columnPrefix ? `${columnPrefix}${col}` : col;

    const query = `
      SELECT
        ${dimensionSelect},
        COUNT(*) AS page_views,
        COUNT(DISTINCT ${colRef('ff_visitor_id')}) AS unique_visitors,
        ROUND(
          COUNT(*) FILTER (WHERE ${colRef('active_time_s')} IS NOT NULL AND ${colRef('active_time_s')} < 5)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE ${colRef('active_time_s')} IS NOT NULL), 0),
          4
        ) AS bounce_rate,
        ROUND(AVG(${colRef('active_time_s')})::numeric, 2) AS avg_active_time,
        COUNT(*) FILTER (WHERE ${colRef('hero_scroll_passed')} = true) AS scroll_past_hero,
        ROUND(
          COUNT(*) FILTER (WHERE ${colRef('hero_scroll_passed')} = true)::numeric
          / NULLIF(COUNT(*), 0),
          4
        ) AS scroll_rate,
        COUNT(*) FILTER (WHERE ${colRef('form_view')} = true) AS form_views,
        ROUND(
          COUNT(*) FILTER (WHERE ${colRef('form_view')} = true)::numeric
          / NULLIF(COUNT(*), 0),
          4
        ) AS form_view_rate,
        COUNT(*) FILTER (WHERE ${colRef('form_started')} = true) AS form_starters,
        ROUND(
          COUNT(*) FILTER (WHERE ${colRef('form_started')} = true)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE ${colRef('form_view')} = true), 0),
          4
        ) AS form_start_rate
      ${fromClause}
      WHERE ${colRef('created_at')} >= $1::date AND ${colRef('created_at')} < ($2::date + interval '1 day')
        ${whereClause}
        ${tableFilterClause}
      GROUP BY ${groupByExpression}
      ORDER BY ${finalSortColumn} ${finalSortDirection}
      LIMIT ${safeLimit}
    `;

    return { query, params };
  }

  /**
   * Normalized source expression for PostgreSQL page view queries.
   * Mirrors the CRM normalization in onPageCrmQueries.ts so tracking IDs match.
   */
  private readonly PG_NORMALIZED_SOURCE = `
    CASE
      WHEN LOWER(utm_source) IN ('google', 'adwords') THEN 'google'
      WHEN LOWER(utm_source) IN ('facebook', 'meta') THEN 'facebook'
      ELSE LOWER(COALESCE(utm_source, ''))
    END`;

  /**
   * Builds a query that groups page views by (target_dimension + tracking ID combo).
   * Used for cross-database CRM matching: the tracking IDs (source, campaign, adset, ad)
   * appear in both PostgreSQL page views and MariaDB CRM subscriptions, enabling
   * application-level joins to attribute conversions to any page view dimension.
   *
   * Uses detailFilterMap (raw columns, no JOINs) for simplicity and performance.
   */
  public buildTrackingMatchQuery(options: QueryOptions): { query: string; params: any[] } {
    const { dateRange, dimensions, depth, parentFilters, filters } = options;

    const currentDimension = dimensions[depth];
    const rawColumn = this.detailFilterMap[currentDimension];
    if (!rawColumn) {
      throw new Error(`Unknown dimension for tracking match: ${currentDimension}`);
    }

    const params: any[] = [
      formatLocalDate(dateRange.start),
      formatLocalDate(dateRange.end),
    ];
    const conditions: string[] = [];

    // Apply parent filters using raw columns (no JOINs)
    if (parentFilters) {
      for (const [dimId, value] of Object.entries(parentFilters)) {
        const col = this.detailFilterMap[dimId];
        if (!col) continue;
        if (value === 'Unknown') {
          conditions.push(`${col} IS NULL`);
        } else {
          params.push(value);
          conditions.push(`${col}::text = $${params.length}`);
        }
      }
    }

    // Apply table filters using raw columns (OR within same field, AND between fields)
    if (filters) {
      const fieldGroups = new Map<string, { col: string; textExpr: string; items: Array<{ operator: string; value: string }> }>();
      for (const filter of filters) {
        if (!filter.value && filter.operator !== 'equals' && filter.operator !== 'not_equals') continue;
        const col = this.detailFilterMap[filter.field];
        if (!col) continue;
        const group = fieldGroups.get(filter.field);
        if (group) {
          group.items.push({ operator: filter.operator, value: filter.value });
        } else {
          fieldGroups.set(filter.field, { col, textExpr: `${col}::text`, items: [{ operator: filter.operator, value: filter.value }] });
        }
      }
      for (const [, g] of fieldGroups) {
        const subs: string[] = [];
        for (const f of g.items) {
          // paramOffset is 0 here — tracking match uses params.length directly
          const cond = this.buildFilterCondition(f, g.col, g.textExpr, params, 0);
          if (cond) subs.push(cond);
        }
        if (subs.length === 1) conditions.push(subs[0]);
        else if (subs.length > 1) conditions.push(`(${subs.join(' OR ')})`);
      }
    }

    const extraWhere = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        ${rawColumn} AS dimension_value,
        ${this.PG_NORMALIZED_SOURCE} AS source,
        COALESCE(utm_campaign, '') AS campaign_id,
        COALESCE(utm_content, '') AS adset_id,
        COALESCE(utm_medium, '') AS ad_id,
        COUNT(DISTINCT ff_visitor_id) AS unique_visitors
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
        ${extraWhere}
      GROUP BY ${rawColumn},
               ${this.PG_NORMALIZED_SOURCE},
               COALESCE(utm_campaign, ''),
               COALESCE(utm_content, ''),
               COALESCE(utm_medium, '')
    `;

    return { query, params };
  }

  /**
   * Maps dimension IDs to raw column names for detail queries (no JOINs needed).
   * Enriched dimensions map to their raw utm_ columns instead of mas.* columns.
   * url_path is already normalized in the materialized view (no # or ? params)
   */
  private readonly detailFilterMap: Record<string, string> = {
    urlPath: 'url_path',
    pageType: 'page_type',
    utmSource: 'LOWER(utm_source)',
    campaign: 'utm_campaign',
    adset: 'utm_content',
    ad: 'utm_medium',
    webmasterId: 'utm_medium',
    funnelId: 'ff_funnel_id',
    utmTerm: 'utm_term',
    deviceType: 'device_type',
    osName: 'os_name',
    browserName: 'browser_name',
    countryCode: 'country_code',
    timezone: 'timezone',
    visitNumber: 'visit_number',
    localHour: 'local_hour_of_day',
    date: 'created_at::date',
  };

  /**
   * Builds a detail query returning individual page view records.
   * No JOINs or aggregations — filters on raw columns only.
   */
  /**
   * Maps metricId to a SQL WHERE clause that filters rows to match that metric.
   */
  private readonly metricFilterMap: Record<string, string> = {
    scrollPastHero: 'hero_scroll_passed = true',
    formViews: 'form_view = true',
    formStarters: 'form_started = true',
  };

  public buildDetailQuery(options: {
    dateRange: { start: Date; end: Date };
    dimensionFilters: Record<string, string>;
    metricId?: string;
    page: number;
    pageSize: number;
  }): { query: string; countQuery: string; params: any[] } {
    const { dateRange, dimensionFilters, metricId, page, pageSize } = options;

    // Base params shared by all queries (date range + dimension filters)
    const baseParams: any[] = [
      formatLocalDate(dateRange.start),
      formatLocalDate(dateRange.end),
    ];

    const conditions: string[] = [];
    for (const [dimId, value] of Object.entries(dimensionFilters)) {
      // Classification dims use IN subqueries (no table alias needed)
      // url_path is already normalized in the view, so direct comparison is fine
      if (dimId === 'classifiedProduct') {
        if (value === 'Unknown') {
          conditions.push(`url_path NOT IN (SELECT uc_f.url_path FROM app_url_classifications uc_f WHERE uc_f.is_ignored = false)`);
        } else {
          baseParams.push(value);
          conditions.push(`url_path IN (SELECT uc_f.url_path FROM app_url_classifications uc_f JOIN app_products ap_f ON uc_f.product_id = ap_f.id WHERE uc_f.is_ignored = false AND ap_f.id::text = $${baseParams.length})`);
        }
        continue;
      }
      if (dimId === 'classifiedCountry') {
        if (value === 'Unknown') {
          conditions.push(`url_path NOT IN (SELECT uc_f.url_path FROM app_url_classifications uc_f WHERE uc_f.is_ignored = false)`);
        } else {
          baseParams.push(value);
          conditions.push(`url_path IN (SELECT uc_f.url_path FROM app_url_classifications uc_f WHERE uc_f.is_ignored = false AND uc_f.country_code = $${baseParams.length})`);
        }
        continue;
      }

      const col = this.detailFilterMap[dimId];
      if (!col) continue;

      if (value === 'Unknown') {
        conditions.push(`${col} IS NULL`);
      } else {
        baseParams.push(value);
        conditions.push(`${col}::text = $${baseParams.length}`);
      }
    }

    // Add metric-specific filter (e.g. hero_scroll_passed = true for scrollPastHero)
    if (metricId && this.metricFilterMap[metricId]) {
      conditions.push(this.metricFilterMap[metricId]);
    }

    const whereExtra = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
    const isUniqueVisitors = metricId === 'uniqueVisitors';

    const baseWhere = `
      WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
        ${whereExtra}
    `;

    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.max(1, Math.min(500, Math.floor(pageSize)));
    const offset = (safePage - 1) * safePageSize;

    const selectCols = `id, created_at, url_path, url_full, ff_visitor_id, session_id,
        visit_number, active_time_s, scroll_percent,
        hero_scroll_passed, form_view, form_started, cta_viewed, cta_clicked,
        device_type, country_code, page_type,
        utm_source, utm_campaign, utm_content, utm_medium, utm_term,
        keyword, placement, referrer, user_agent, language, platform,
        os_name, os_version, browser_name, fcp_s, lcp_s, tti_s, form_errors`;

    const query = isUniqueVisitors
      ? `
      SELECT ${selectCols}
      FROM (
        SELECT DISTINCT ON (ff_visitor_id) ${selectCols}
        FROM remote_session_tracker.event_page_view_enriched_v2
        ${baseWhere}
        ORDER BY ff_visitor_id, created_at DESC
      ) sub
      ORDER BY created_at DESC, ff_visitor_id ASC
      LIMIT ${safePageSize} OFFSET ${offset}
    `
      : `
      SELECT ${selectCols}
      FROM remote_session_tracker.event_page_view_enriched_v2
      ${baseWhere}
      ORDER BY created_at DESC, ff_visitor_id ASC
      LIMIT ${safePageSize} OFFSET ${offset}
    `;

    const countQuery = isUniqueVisitors
      ? `
      SELECT COUNT(DISTINCT ff_visitor_id) as total
      FROM remote_session_tracker.event_page_view_enriched_v2
      ${baseWhere}
    `
      : `
      SELECT COUNT(*) as total
      FROM remote_session_tracker.event_page_view_enriched_v2
      ${baseWhere}
    `;

    return { query, countQuery, params: baseParams };
  }
}

// Export singleton instance
export const onPageQueryBuilder = new OnPageQueryBuilder();
