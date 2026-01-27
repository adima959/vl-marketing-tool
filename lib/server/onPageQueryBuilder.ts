import type { QueryOptions } from './types';

/**
 * Builds dynamic SQL queries for on-page analytics reporting
 * Table: remote_session_tracker.event_page_view_enriched_v2
 */
export class OnPageQueryBuilder {
  /**
   * Maps frontend dimension IDs to database column names
   */
  private readonly dimensionMap: Record<string, string> = {
    urlPath: 'url_path',
    pageType: 'page_type',
    utmSource: 'utm_source',
    campaign: 'utm_campaign',
    adset: 'adset_id',
    ad: 'ad_id',
    deviceType: 'device_type',
    osName: 'os_name',
    browserName: 'browser_name',
    countryCode: 'country_code',
    date: "created_at::date",
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
   */
  private buildParentFilters(
    parentFilters: Record<string, string> | undefined,
    paramOffset: number,
    columnPrefix: string = ''
  ): { whereClause: string; params: any[] } {
    if (!parentFilters || Object.keys(parentFilters).length === 0) {
      return { whereClause: '', params: [] };
    }

    const params: any[] = [];
    const conditions: string[] = [];

    Object.entries(parentFilters).forEach(([dimId, value]) => {
      const sqlColumn = this.dimensionMap[dimId];
      if (!sqlColumn) {
        throw new Error(`Unknown dimension in parent filter: ${dimId}`);
      }
      params.push(value);
      if (dimId === 'date') {
        conditions.push(`${columnPrefix}created_at::date = $${paramOffset + params.length}`);
      } else if (this.enrichedDimensions[dimId]) {
        // Enriched dimensions use their specific filter expression
        const dimEnriched = this.enrichedDimensions[dimId];
        conditions.push(`${dimEnriched.parentFilterExpr} = $${paramOffset + params.length}`);
      } else {
        conditions.push(`${columnPrefix}${sqlColumn} = $${paramOffset + params.length}`);
      }
    });

    return {
      whereClause: `AND ${conditions.join(' AND ')}`,
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
    const allInvolvedDims = [currentDimension, ...Object.keys(parentFilters || {})];
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

    const anyJoinNeeded = joinLevel !== null;
    const tableAlias = anyJoinNeeded ? 'pv' : '';
    const columnPrefix = tableAlias ? `${tableAlias}.` : '';

    // For SELECT/GROUP BY, use dimension-specific prefix
    const dimPrefix = enriched?.dimColumnPrefix ?? columnPrefix;
    const selectExpression = currentDimension === 'date'
      ? 'created_at::date'
      : `${dimPrefix}${sqlColumn}`;
    const groupByExpression = selectExpression;

    // Get sort column
    const sortColumn = this.metricMap[sortBy] || 'page_views';
    const finalSortColumn = currentDimension === 'date' ? 'dimension_value' : sortColumn;
    const finalSortDirection = currentDimension === 'date' ? 'DESC' : sortDirection;

    // Build parameters
    const params: any[] = [
      dateRange.start.toISOString().split('T')[0], // $1
      dateRange.end.toISOString().split('T')[0],   // $2
    ];

    // Build parent filters
    const { whereClause, params: filterParams } = this.buildParentFilters(
      parentFilters,
      params.length,
      columnPrefix
    );
    params.push(...filterParams);

    // Build SELECT columns for dimension
    let dimensionSelect: string;
    if (enriched) {
      dimensionSelect = `
        ${selectExpression}::text AS dimension_id,
        COALESCE(${enriched.nameExpression} || ' (' || ${selectExpression}::text || ')', COALESCE(${selectExpression}::text, '(not set)')) AS dimension_value`;
    } else {
      dimensionSelect = `${selectExpression} AS dimension_value`;
    }

    // Build FROM clause with JOIN tailored to the required level
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
      ) mas ON pv.utm_campaign::text = mas.campaign_id::text${extraJoinCondition}`;
    } else {
      fromClause = `FROM remote_session_tracker.event_page_view_enriched_v2`;
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
      GROUP BY ${groupByExpression}
      ORDER BY ${finalSortColumn} ${finalSortDirection}
      LIMIT ${safeLimit}
    `;

    return { query, params };
  }
}

// Export singleton instance
export const onPageQueryBuilder = new OnPageQueryBuilder();
