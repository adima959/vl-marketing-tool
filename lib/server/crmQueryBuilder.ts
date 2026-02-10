import type { DateRange } from '@/types/dashboard';
import { validateSortDirection } from './types';
import { CRM_METRICS, OTS_METRICS, CRM_JOINS, OTS_JOINS, CRM_WHERE, formatDateForMariaDB } from './crmMetrics';
import { FilterBuilder } from './queryBuilderUtils';

type SqlParam = string | number | boolean | null | Date;

/**
 * Grouping strategy for CRM queries
 * - geography: Groups by country/product/source (Dashboard)
 * - tracking: Groups by campaign/adset/ad via tracking IDs (Marketing)
 */
export type GroupByStrategy =
  | { type: 'geography'; dimensions: string[] }
  | { type: 'tracking'; dimensions: string[] };

export interface CRMQueryOptions {
  dateRange: DateRange;
  groupBy: GroupByStrategy;
  depth: number;
  parentFilters?: Record<string, string>;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
  productFilter?: string; // Optional: '%Balansera%'
  limit?: number;
}

/**
 * Unified CRM Query Builder
 *
 * Consolidates CRM query building logic from Dashboard and Marketing into a single source of truth.
 * Supports two grouping strategies:
 * 1. Geography Mode: Groups by country/product/source (Dashboard)
 * 2. Tracking Mode: Groups by campaign/adset/ad via tracking IDs (Marketing)
 *
 * Key principles:
 * - Uses shared metric definitions from crmMetrics.ts
 * - Handles different JOIN strategies (LEFT for dashboard, INNER for marketing)
 * - Handles different WHERE conditions (tracking validation, deleted subscriptions)
 * - Single source of truth - changes apply to both Dashboard and Marketing
 */
export class CRMQueryBuilder {
  /**
   * Geography mode dimension mappings (Dashboard)
   * Maps dimension IDs to SQL expressions for SELECT and GROUP BY
   */
  private readonly geographyDimensions: Record<string, { selectExpr: string; groupByExpr: string }> = {
    country: {
      selectExpr: 'c.country',
      groupByExpr: 'c.country',
    },
    productName: {
      selectExpr: 'COALESCE(pg.group_name, pg_sub.group_name) AS product_group_name',
      groupByExpr: 'COALESCE(pg.group_name, pg_sub.group_name)',
    },
    product: {
      selectExpr: 'COALESCE(p.product_name, p_sub.product_name) AS product_name',
      groupByExpr: 'COALESCE(p.product_name, p_sub.product_name)',
    },
    source: {
      selectExpr: 'COALESCE(sr.source, sr_sub.source) AS source',
      groupByExpr: 'COALESCE(sr.source, sr_sub.source)',
    },
  };

  /**
   * Tracking mode dimension mappings (Marketing)
   * Maps dimension IDs to tracking ID columns
   */
  private readonly trackingDimensions: Record<string, { selectExpr: string; groupByExpr: string }> = {
    campaign: {
      selectExpr: 's.tracking_id_4 AS campaign_id',
      groupByExpr: 's.tracking_id_4',
    },
    adset: {
      selectExpr: 's.tracking_id_2 AS adset_id',
      groupByExpr: 's.tracking_id_2',
    },
    ad: {
      selectExpr: 's.tracking_id AS ad_id',
      groupByExpr: 's.tracking_id',
    },
    date: {
      selectExpr: 'DATE(s.date_create) AS date',
      groupByExpr: 'DATE(s.date_create)',
    },
  };

  /**
   * Metric ID to SQL column mapping (for sorting)
   */
  private readonly metricMap: Record<string, string> = {
    customers: 'customer_count',
    subscriptions: 'subscription_count',
    trials: 'trial_count',
    ots: 'ots_count',
    trialsApproved: 'trials_approved_count',
    upsells: 'upsell_count',
    upsellsApproved: 'upsells_approved_count',
  };

  /**
   * Filter builders for geography mode
   */
  private readonly geographyFilterBuilder = new FilterBuilder({
    dbType: 'mariadb',
    dimensionMap: {
      country: {
        column: 'c.country',
        nullCheck: "(c.country IS NULL OR c.country = '')",
      },
      productName: {
        column: 'COALESCE(pg.group_name, pg_sub.group_name)',
      },
      product: {
        column: 'COALESCE(p.product_name, p_sub.product_name)',
      },
      source: {
        column: 'COALESCE(sr.source, sr_sub.source)',
      },
    },
  });

  /**
   * Filter builders for tracking mode
   */
  private readonly trackingFilterBuilder = new FilterBuilder({
    dbType: 'mariadb',
    dimensionMap: {
      campaign: 's.tracking_id_4',
      adset: 's.tracking_id_2',
      ad: 's.tracking_id',
      date: 'DATE(s.date_create)',
    },
  });

  /**
   * Build SELECT columns based on dimensions and depth
   */
  private buildSelectColumns(dimensions: string[], depth: number, groupBy: GroupByStrategy): string {
    const dimMap = groupBy.type === 'geography' ? this.geographyDimensions : this.trackingDimensions;
    const columns: string[] = [];
    for (let i = 0; i <= depth; i++) {
      const dim = dimensions[i];
      const config = dimMap[dim];
      if (!config) {
        throw new Error(`Unknown dimension for ${groupBy.type} mode: ${dim}`);
      }
      columns.push(config.selectExpr);
    }
    return columns.join(',\n        ');
  }

  /**
   * Build GROUP BY clause based on dimensions and depth
   */
  private buildGroupByClause(dimensions: string[], depth: number, groupBy: GroupByStrategy): string {
    const dimMap = groupBy.type === 'geography' ? this.geographyDimensions : this.trackingDimensions;
    const columns: string[] = [];
    for (let i = 0; i <= depth; i++) {
      const dim = dimensions[i];
      const config = dimMap[dim];
      if (!config) {
        throw new Error(`Unknown dimension for ${groupBy.type} mode: ${dim}`);
      }
      columns.push(config.groupByExpr);
    }
    return columns.join(', ');
  }

  /**
   * Build parent filter WHERE clause
   */
  private buildParentFilters(
    parentFilters: Record<string, string> | undefined,
    groupBy: GroupByStrategy
  ): { whereClause: string; params: SqlParam[] } {
    const filterBuilder = groupBy.type === 'geography'
      ? this.geographyFilterBuilder
      : this.trackingFilterBuilder;
    return filterBuilder.buildParentFilters(parentFilters);
  }

  /**
   * Build subscription query with either geography or tracking grouping
   *
   * Key differences between modes:
   * - Geography: Uses LEFT JOIN for invoice, COALESCE for product paths
   * - Tracking: Uses INNER JOIN for invoice, tracking ID validation, deleted subscription exclusion
   */
  public buildQuery(options: CRMQueryOptions): { query: string; params: SqlParam[] } {
    const {
      dateRange,
      groupBy,
      depth,
      parentFilters,
      sortBy = 'subscriptions',
      sortDirection = 'DESC',
      productFilter,
      limit = 1000,
    } = options;

    // Validate depth
    if (depth < 0 || depth >= groupBy.dimensions.length) {
      throw new Error(`Invalid depth: ${depth}. Must be 0 to ${groupBy.dimensions.length - 1}.`);
    }

    const sortColumn = this.metricMap[sortBy] || 'subscription_count';
    const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));

    const startDate = formatDateForMariaDB(dateRange.start, false);
    const endDate = formatDateForMariaDB(dateRange.end, true);

    const { whereClause, params: filterParams } = this.buildParentFilters(parentFilters, groupBy);

    const selectColumns = this.buildSelectColumns(groupBy.dimensions, depth, groupBy);
    const groupByClause = this.buildGroupByClause(groupBy.dimensions, depth, groupBy);

    // Mode-specific configuration
    const isTracking = groupBy.type === 'tracking';
    const invoiceJoin = isTracking ? CRM_JOINS.invoiceTrialInner : CRM_JOINS.invoiceTrialLeft;
    const trialCountExpr = isTracking ? CRM_METRICS.trialCount.innerJoinExpr : CRM_METRICS.trialCount.leftJoinExpr;
    const trialsApprovedExpr = isTracking ? CRM_METRICS.trialsApprovedCount.innerJoinExpr : CRM_METRICS.trialsApprovedCount.leftJoinExpr;

    // Geography mode needs product/source JOINs, tracking mode doesn't
    const geographyJoins = groupBy.type === 'geography' ? `
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      ${CRM_JOINS.sourceFromInvoice}
      ${CRM_JOINS.sourceFromSubAlt}
    ` : `
      ${CRM_JOINS.sourceFromSub}
    `;

    // Tracking mode specific WHERE clauses
    const trackingWhere = isTracking ? `
      AND ${CRM_WHERE.deletedSubExclusion}
      AND ${CRM_WHERE.trackingIdValidation.join('\n      AND ')}
    ` : '';

    // Product filter (only for tracking mode via existing pattern)
    const productFilterWhere = isTracking && productFilter ? `
      AND EXISTS (
        SELECT 1 FROM invoice_product ip
        INNER JOIN product p ON p.id = ip.product_id
        WHERE ip.invoice_id = i.id AND p.product_name LIKE ?
      )
    ` : '';

    const productFilterParams = isTracking && productFilter ? [productFilter] : [];

    const query = `
      SELECT
        ${selectColumns},
        ${CRM_METRICS.customerCount.expr} AS ${CRM_METRICS.customerCount.alias},
        ${CRM_METRICS.subscriptionCount.expr} AS ${CRM_METRICS.subscriptionCount.alias},
        ${trialCountExpr} AS ${CRM_METRICS.trialCount.alias},
        ${trialsApprovedExpr} AS ${CRM_METRICS.trialsApprovedCount.alias},
        ${CRM_METRICS.upsellCount.expr} AS ${CRM_METRICS.upsellCount.alias},
        ${CRM_METRICS.upsellsApprovedCount.expr} AS ${CRM_METRICS.upsellsApprovedCount.alias}
      FROM subscription s
      ${CRM_JOINS.customer}
      ${invoiceJoin}
      ${geographyJoins}
      ${CRM_JOINS.upsell}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.upsellExclusion}
        ${trackingWhere}
        ${productFilterWhere}
        ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY ${sortColumn} ${validateSortDirection(sortDirection)}
      LIMIT ${safeLimit}
    `;

    const params = [startDate, endDate, ...productFilterParams, ...filterParams];
    return { query, params };
  }

  /**
   * Build OTS query with either geography or tracking grouping
   */
  public buildOtsQuery(options: CRMQueryOptions): { query: string; params: SqlParam[] } {
    const {
      dateRange,
      groupBy,
      depth,
      parentFilters,
    } = options;

    const startDate = formatDateForMariaDB(dateRange.start, false);
    const endDate = formatDateForMariaDB(dateRange.end, true);

    const { whereClause, params: filterParams } = this.buildParentFilters(parentFilters, groupBy);

    const selectColumns = this.buildSelectColumns(groupBy.dimensions, depth, groupBy);
    const groupByClause = this.buildGroupByClause(groupBy.dimensions, depth, groupBy);

    // Mode-specific configuration
    const isTracking = groupBy.type === 'tracking';

    // Geography mode needs product JOINs, tracking mode doesn't
    const geographyJoins = groupBy.type === 'geography' ? `
      ${OTS_JOINS.customer}
      ${OTS_JOINS.invoiceProduct}
      ${OTS_JOINS.product}
      ${OTS_JOINS.productGroup}
      ${OTS_JOINS.source}
    ` : `
      ${OTS_JOINS.source}
    `;

    // Tracking mode specific WHERE clauses
    const trackingWhere = isTracking ? `
      AND ${CRM_WHERE.otsTrackingIdValidation.join('\n      AND ')}
    ` : '';

    // Build SELECT expression for tracking mode OTS (needs tracking IDs)
    const trackingSelectColumns = isTracking ?
      this.buildSelectColumns(groupBy.dimensions, depth, { type: 'tracking', dimensions: groupBy.dimensions }).replace(/s\./g, 'i.') :
      selectColumns;

    const trackingGroupByClause = isTracking ?
      this.buildGroupByClause(groupBy.dimensions, depth, { type: 'tracking', dimensions: groupBy.dimensions }).replace(/s\./g, 'i.').replace(/DATE\(s\.date_create\)/g, 'DATE(i.order_date)') :
      groupByClause;

    const query = `
      SELECT
        ${isTracking ? trackingSelectColumns : selectColumns},
        ${OTS_METRICS.otsCount.expr} AS ${OTS_METRICS.otsCount.alias},
        ${OTS_METRICS.otsApprovedCount.expr} AS ${OTS_METRICS.otsApprovedCount.alias}
      FROM invoice i
      ${geographyJoins}
      WHERE ${CRM_WHERE.otsBase}
        AND i.order_date BETWEEN ? AND ?
        ${trackingWhere}
        ${whereClause}
      GROUP BY ${isTracking ? trackingGroupByClause : groupByClause}
    `;

    return { query, params: [startDate, endDate, ...filterParams] };
  }

  /**
   * Build time series query for dashboard chart (daily aggregation)
   * Only used by Dashboard (geography mode)
   */
  public buildTimeSeriesQuery(dateRange: DateRange): { query: string; params: SqlParam[] } {
    const startDate = formatDateForMariaDB(dateRange.start, false);
    const endDate = formatDateForMariaDB(dateRange.end, true);

    const query = `
      SELECT
        DATE(s.date_create) AS date,
        ${CRM_METRICS.customerCount.expr} AS customers,
        ${CRM_METRICS.subscriptionCount.expr} AS subscriptions,
        ${CRM_METRICS.trialCount.leftJoinExpr} AS trials,
        ${CRM_METRICS.trialsApprovedCount.leftJoinExpr} AS trialsApproved,
        ${CRM_METRICS.upsellCount.expr} AS upsells,
        ${CRM_METRICS.upsellsApprovedCount.expr} AS upsellsApproved
      FROM subscription s
      ${CRM_JOINS.customer}
      ${CRM_JOINS.invoiceTrialLeft}
      ${CRM_JOINS.upsell}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.upsellExclusion}
      GROUP BY DATE(s.date_create)
      ORDER BY date ASC
    `;

    return { query, params: [startDate, endDate] };
  }

  /**
   * Build OTS time series query for dashboard chart (daily aggregation)
   * Only used by Dashboard (geography mode)
   */
  public buildOtsTimeSeriesQuery(dateRange: DateRange): { query: string; params: SqlParam[] } {
    const startDate = formatDateForMariaDB(dateRange.start, false);
    const endDate = formatDateForMariaDB(dateRange.end, true);

    const query = `
      SELECT
        DATE(i.order_date) AS date,
        ${OTS_METRICS.otsCount.expr} AS ots,
        ${OTS_METRICS.otsApprovedCount.expr} AS otsApproved
      FROM invoice i
      WHERE ${CRM_WHERE.otsBase}
        AND i.order_date BETWEEN ? AND ?
      GROUP BY DATE(i.order_date)
      ORDER BY date ASC
    `;

    return { query, params: [startDate, endDate] };
  }
}

// Export singleton instance
export const crmQueryBuilder = new CRMQueryBuilder();
