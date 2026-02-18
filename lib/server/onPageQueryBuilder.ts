import { formatLocalDate } from '@/lib/types/api';

type SqlParam = string | number | boolean | null | Date;

/**
 * Builds SQL queries for on-page analytics detail views.
 * Table: remote_session_tracker.event_page_view_enriched_v2
 */
export class OnPageQueryBuilder {
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
    date: 'created_at::date',
  };

  /**
   * Maps session entry-level dimension IDs to session_entries columns.
   * Used in buildDetailQuery to filter page views via session_id subquery.
   */
  private readonly entryDimToSessionCol: Record<string, string> = {
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
    entryCountryCode: 'entry_country_code',
    entryDeviceType: 'entry_device_type',
    entryOsName: 'entry_os_name',
    entryBrowserName: 'entry_browser_name',
  };

  /**
   * Maps metricId to a SQL WHERE clause that filters rows to match that metric.
   */
  private readonly metricFilterMap: Record<string, string> = {
    scrollPastHero: 'hero_scroll_passed = true',
    formViews: 'form_view = true',
    formStarters: 'form_started = true',
  };

  /**
   * Maps metricId to a session_entries WHERE clause for session-scoped count queries.
   * These match the FILTER clauses used in the session table's aggregate query.
   */
  private readonly sessionMetricFilterMap: Record<string, string> = {
    scrollPastHero: 'entry_hero_scroll_passed = true',
    formViews: 'entry_form_view = true',
    formStarters: 'entry_form_started = true',
  };

  /**
   * Builds a detail query returning individual page view records.
   * Supports both page-view mode (direct filters) and session-scoped mode
   * (entry-level dimensions filtered via session_entries subquery).
   */
  public buildDetailQuery(options: {
    dateRange: { start: Date; end: Date };
    dimensionFilters: Record<string, string>;
    metricId?: string;
    page: number;
    pageSize: number;
  }): { query: string; countQuery: string; params: SqlParam[] } {
    const { dateRange, dimensionFilters, metricId, page, pageSize } = options;

    // Base params shared by all queries (date range + dimension filters)
    const baseParams: SqlParam[] = [
      formatLocalDate(dateRange.start),
      formatLocalDate(dateRange.end),
    ];

    const conditions: string[] = [];
    // Collect entry-level dimension conditions to consolidate into ONE subquery
    const entryConditions: string[] = [];

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

      // Entry-level dimensions: collect into ONE consolidated subquery
      const entryCol = this.entryDimToSessionCol[dimId];
      if (entryCol) {
        if (value === 'Unknown') {
          entryConditions.push(`${entryCol} IS NULL`);
        } else {
          baseParams.push(value);
          entryConditions.push(`${entryCol}::text = $${baseParams.length}`);
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

    // Single session_entries subquery for all entry-level filters
    if (entryConditions.length > 0) {
      conditions.push(
        `session_id IN (SELECT session_id FROM remote_session_tracker.session_entries WHERE session_start >= $1::date AND session_start < ($2::date + interval '1 day') AND ${entryConditions.join(' AND ')})`
      );
    }

    // Add metric-specific filter (e.g. hero_scroll_passed = true for scrollPastHero)
    if (metricId && this.metricFilterMap[metricId]) {
      conditions.push(this.metricFilterMap[metricId]);
    }

    const whereExtra = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
    const isUniqueVisitors = metricId === 'uniqueVisitors';
    const hasEntryFilters = entryConditions.length > 0;

    const baseWhere = `
      WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
        ${whereExtra}
    `;

    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.max(1, Math.min(50000, Math.floor(pageSize)));
    const offset = (safePage - 1) * safePageSize;

    const selectCols = `id, created_at, url_path, url_full, ff_visitor_id, session_id,
        visit_number, active_time_s, scroll_percent,
        hero_scroll_passed, form_view, form_started, cta_viewed, cta_clicked,
        device_type, country_code, page_type,
        utm_source, utm_campaign, utm_content, utm_medium, utm_term,
        keyword, placement, referrer, user_agent, language, platform,
        os_name, os_version, browser_name, fcp_s, lcp_s, tti_s, dcl_s, load_s,
        timezone, local_hour_of_day, form_errors, form_errors_detail`;

    // Session-scoped mode: count from session_entries (matches session table),
    // show one page view per session (entry page view) in the data.
    if (hasEntryFilters) {
      const sessionMetricFilter = metricId ? this.sessionMetricFilterMap[metricId] : undefined;
      const sessionWhere = `WHERE session_start >= $1::date AND session_start < ($2::date + interval '1 day') AND ${entryConditions.join(' AND ')}${sessionMetricFilter ? ` AND ${sessionMetricFilter}` : ''}`;

      const countQuery = isUniqueVisitors
        ? `SELECT COUNT(DISTINCT ff_visitor_id) as total FROM remote_session_tracker.session_entries ${sessionWhere}`
        : `SELECT COUNT(*) as total FROM remote_session_tracker.session_entries ${sessionWhere}`;

      // Data: one page view per session (entry page), then deduplicate by visitor for uniqueVisitors
      const query = isUniqueVisitors
        ? `
        SELECT ${selectCols} FROM (
          SELECT DISTINCT ON (ff_visitor_id) ${selectCols}
          FROM (
            SELECT DISTINCT ON (session_id) ${selectCols}
            FROM remote_session_tracker.event_page_view_enriched_v2
            ${baseWhere}
            ORDER BY session_id, created_at ASC
          ) entry_views
          ORDER BY ff_visitor_id, created_at DESC
        ) sub
        ORDER BY created_at DESC, ff_visitor_id ASC
        LIMIT ${safePageSize} OFFSET ${offset}
      `
        : `
        SELECT ${selectCols} FROM (
          SELECT DISTINCT ON (session_id) ${selectCols}
          FROM remote_session_tracker.event_page_view_enriched_v2
          ${baseWhere}
          ORDER BY session_id, created_at ASC
        ) sub
        ORDER BY created_at DESC, ff_visitor_id ASC
        LIMIT ${safePageSize} OFFSET ${offset}
      `;

      return { query, countQuery, params: baseParams };
    }

    // Standard page-view mode (no entry dimensions)
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
