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
    utmContent: 'utm_content',
    utmMedium: 'utm_medium',
    deviceType: 'device_type',
    osName: 'os_name',
    browserName: 'browser_name',
    countryCode: 'country_code',
    date: "created_at::date",
  };

  /**
   * Enriched dimensions that produce a dimension_id column alongside dimension_value.
   * Maps dimension ID to the name column used for display.
   */
  private readonly enrichedDimensions: Record<string, { nameExpression: string; needsJoin: boolean }> = {
    campaign: { nameExpression: 'MAX(mas.campaign_name)', needsJoin: true },
    adset: { nameExpression: 'MAX(pv.adset_name)', needsJoin: false },
    ad: { nameExpression: 'MAX(pv.ad_name)', needsJoin: false },
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
    formStarters: 'form_starters',
    ctaClicks: 'cta_clicks',
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
      // Handle date dimension specially since it's an expression
      if (dimId === 'date') {
        conditions.push(`${columnPrefix}created_at::date = $${paramOffset + params.length}`);
      } else if (this.enrichedDimensions[dimId]) {
        // Enriched dimensions compare as text to avoid type mismatches
        conditions.push(`${columnPrefix}${sqlColumn}::text = $${paramOffset + params.length}`);
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

    // Determine if this is an enriched dimension
    const enriched = this.enrichedDimensions[currentDimension];
    const tableAlias = enriched ? 'pv' : '';
    const columnPrefix = tableAlias ? `${tableAlias}.` : '';

    // For the SELECT/GROUP BY, use the expression directly for date, column name for others
    const selectExpression = currentDimension === 'date'
      ? 'created_at::date'
      : `${columnPrefix}${sqlColumn}`;
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

    // Build FROM clause (with optional JOIN)
    let fromClause: string;
    if (enriched?.needsJoin) {
      fromClause = `
      FROM remote_session_tracker.event_page_view_enriched_v2 pv
      LEFT JOIN (
        SELECT DISTINCT campaign_id, campaign_name FROM merged_ads_spending
      ) mas ON pv.utm_campaign::text = mas.campaign_id::text`;
    } else if (enriched) {
      fromClause = `FROM remote_session_tracker.event_page_view_enriched_v2 pv`;
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
        COUNT(*) FILTER (WHERE ${colRef('form_started')} = true) AS form_starters,
        COUNT(*) FILTER (WHERE ${colRef('page_elements')} IS NOT NULL
          AND ${colRef('page_elements')}::text LIKE '%cta%'
          AND EXISTS (
            SELECT 1 FROM jsonb_each(${colRef('page_elements')}) AS pe(k, v)
            WHERE k ILIKE '%cta%' AND v->>'clicked' = 'true'
          )
        ) AS cta_clicks
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
