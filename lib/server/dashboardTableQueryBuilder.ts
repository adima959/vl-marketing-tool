import type { DateRange } from '@/types/dashboard';
import { validateSortDirection } from './types';
import { CRM_METRICS, OTS_METRICS, CRM_JOINS, OTS_JOINS, CRM_WHERE, formatDateForMariaDB } from './crmMetrics';
import { FilterBuilder, type DimensionConfig } from './queryBuilderUtils';

type SqlParam = string | number | boolean | null | Date;

interface QueryOptions {
  dateRange: DateRange;
  dimensions: string[]; // ['country', 'productName', 'product', 'source']
  depth: number;        // 0, 1, 2, or 3
  parentFilters?: Record<string, string>; // { country: 'DENMARK' } or { country: 'DENMARK', productName: 'Men' } or { country: 'DENMARK', productName: 'Men', product: 'T-Formula' } etc.
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
  limit?: number;
}

/**
 * Builds dynamic SQL queries for Dashboard hierarchical reporting
 *
 * Depth 0: Group by country
 * Depth 1: Group by country + product group name (filtered by parent country)
 * Depth 2: Group by country + product group name + product (filtered by parent country + product group)
 * Depth 3: Group by country + product group name + product + source (filtered by parent country + product group + product)
 */
export class DashboardTableQueryBuilder {
  /**
   * Maps dashboard dimension IDs to database columns
   */
  private readonly dimensionMap: Record<string, { selectExpr: string; groupByExpr: string }> = {
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
   * Maps dashboard metric IDs to SQL expressions (for sorting)
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
   * Filter builder for subscription-based dimensions (with COALESCE for alternative paths)
   */
  private readonly filterBuilder = new FilterBuilder({
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
   * Builds parent filter WHERE clause using FilterBuilder utility
   * Handles "Unknown" values by converting them to IS NULL conditions
   */
  private buildParentFilters(
    parentFilters: Record<string, string> | undefined
  ): { whereClause: string; params: SqlParam[] } {
    return this.filterBuilder.buildParentFilters(parentFilters);
  }

  /**
   * Build SELECT columns based on dimensions and depth
   * Returns columns for the current depth level
   */
  private buildSelectColumns(dimensions: string[], depth: number): string {
    const columns: string[] = [];
    for (let i = 0; i <= depth; i++) {
      const dim = dimensions[i];
      columns.push(this.dimensionMap[dim].selectExpr);
    }
    return columns.join(',\n        ');
  }

  /**
   * Build GROUP BY clause based on dimensions and depth
   */
  private buildGroupByClause(dimensions: string[], depth: number): string {
    const columns: string[] = [];
    for (let i = 0; i <= depth; i++) {
      const dim = dimensions[i];
      columns.push(this.dimensionMap[dim].groupByExpr);
    }
    return columns.join(', ');
  }

  /**
   * Build query for any depth level (consolidated from depth0/1/2)
   * Dynamically builds SELECT, GROUP BY, WHERE based on depth and parent filters
   */
  private buildDepthQuery(options: QueryOptions): { query: string; params: SqlParam[] } {
    const {
      dateRange,
      dimensions,
      depth,
      parentFilters,
      sortBy = 'subscriptions',
      sortDirection = 'DESC',
      limit = 1000
    } = options;

    const sortColumn = this.metricMap[sortBy] || 'subscription_count';
    const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));

    const startDate = formatDateForMariaDB(dateRange.start, false);
    const endDate = formatDateForMariaDB(dateRange.end, true);

    const { whereClause, params: filterParams } = this.buildParentFilters(parentFilters);

    const selectColumns = this.buildSelectColumns(dimensions, depth);
    const groupByClause = this.buildGroupByClause(dimensions, depth);

    const query = `
      SELECT
        ${selectColumns},
        ${CRM_METRICS.customerCount.expr} AS ${CRM_METRICS.customerCount.alias},
        ${CRM_METRICS.subscriptionCount.expr} AS ${CRM_METRICS.subscriptionCount.alias},
        ${CRM_METRICS.trialCount.leftJoinExpr} AS ${CRM_METRICS.trialCount.alias},
        ${CRM_METRICS.trialsApprovedCount.leftJoinExpr} AS ${CRM_METRICS.trialsApprovedCount.alias},
        ${CRM_METRICS.upsellCount.expr} AS ${CRM_METRICS.upsellCount.alias},
        ${CRM_METRICS.upsellsApprovedCount.expr} AS ${CRM_METRICS.upsellsApprovedCount.alias}
      FROM subscription s
      ${CRM_JOINS.customer}
      ${CRM_JOINS.invoiceTrialLeft}
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      ${CRM_JOINS.sourceFromInvoice}
      ${CRM_JOINS.sourceFromSubAlt}
      ${CRM_JOINS.upsell}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.upsellExclusion}
        ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY ${sortColumn} ${validateSortDirection(sortDirection)}
      LIMIT ${safeLimit}
    `;

    const params = [startDate, endDate, ...filterParams];
    return { query, params };
  }

  /**
   * Build query for time series chart (daily aggregation)
   * Groups metrics by date for line chart visualization
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
   * OTS dimension map — OTS invoices are standalone (no subscription),
   * so dimensions come directly from the invoice's own product/customer/source.
   * No COALESCE needed since there's only one path.
   */
  private readonly otsDimensionMap: Record<string, { selectExpr: string; groupByExpr: string }> = {
    country: {
      selectExpr: 'c.country',
      groupByExpr: 'c.country',
    },
    productName: {
      selectExpr: 'pg.group_name AS product_group_name',
      groupByExpr: 'pg.group_name',
    },
    product: {
      selectExpr: 'p.product_name',
      groupByExpr: 'p.product_name',
    },
    source: {
      selectExpr: 'sr.source',
      groupByExpr: 'sr.source',
    },
  };

  /**
   * Filter builder for OTS dimensions (simpler - no COALESCE needed)
   */
  private readonly otsFilterBuilder = new FilterBuilder({
    dbType: 'mariadb',
    dimensionMap: {
      country: {
        column: 'c.country',
        nullCheck: "(c.country IS NULL OR c.country = '')",
      },
      productName: 'pg.group_name',
      product: 'p.product_name',
      source: 'sr.source',
    },
  });

  /**
   * Build parent filter WHERE clause for OTS queries using FilterBuilder utility
   * Simpler than subscription filters — no COALESCE, direct column references.
   */
  private buildOtsParentFilters(
    parentFilters: Record<string, string> | undefined
  ): { whereClause: string; params: SqlParam[] } {
    return this.otsFilterBuilder.buildParentFilters(parentFilters);
  }

  /**
   * Build standalone OTS query grouped by the same dimensions as the main query.
   * OTS invoices (type=3) are standalone — they link to customers via customer_id
   * and to products via invoice_product, not via subscription.
   */
  public buildOtsQuery(options: QueryOptions): { query: string; params: SqlParam[] } {
    const { dateRange, dimensions, depth, parentFilters } = options;

    const startDate = formatDateForMariaDB(dateRange.start, false);
    const endDate = formatDateForMariaDB(dateRange.end, true);

    const { whereClause, params: filterParams } = this.buildOtsParentFilters(parentFilters);

    // Build SELECT/GROUP BY from OTS dimension map
    const selectCols: string[] = [];
    const groupByCols: string[] = [];
    for (let i = 0; i <= depth; i++) {
      const dim = dimensions[i];
      selectCols.push(this.otsDimensionMap[dim].selectExpr);
      groupByCols.push(this.otsDimensionMap[dim].groupByExpr);
    }

    const query = `
      SELECT
        ${selectCols.join(',\n        ')},
        ${OTS_METRICS.otsCount.expr} AS ${OTS_METRICS.otsCount.alias},
        ${OTS_METRICS.otsApprovedCount.expr} AS ${OTS_METRICS.otsApprovedCount.alias}
      FROM invoice i
      ${OTS_JOINS.customer}
      ${OTS_JOINS.invoiceProduct}
      ${OTS_JOINS.product}
      ${OTS_JOINS.productGroup}
      ${OTS_JOINS.source}
      WHERE ${CRM_WHERE.otsBase}
        -- OTS invoices don't have subscriptions, so we filter by invoice order_date
        -- instead of subscription date_create
        AND i.order_date BETWEEN ? AND ?
        ${whereClause}
      GROUP BY ${groupByCols.join(', ')}
    `;

    return { query, params: [startDate, endDate, ...filterParams] };
  }

  /**
   * Build standalone OTS time series query (daily aggregation by order_date).
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
        -- OTS invoices don't have subscriptions, so we filter by invoice order_date
        -- instead of subscription date_create
        AND i.order_date BETWEEN ? AND ?
      GROUP BY DATE(i.order_date)
      ORDER BY date ASC
    `;

    return { query, params: [startDate, endDate] };
  }

  /**
   * Main entry point - builds query for any valid depth
   */
  public buildQuery(options: QueryOptions): { query: string; params: SqlParam[] } {
    const { depth, dimensions } = options;

    // Validate depth
    if (depth < 0 || depth >= dimensions.length) {
      throw new Error(`Invalid depth: ${depth}. Must be 0 to ${dimensions.length - 1}.`);
    }

    return this.buildDepthQuery(options);
  }
}

// Export singleton instance
export const dashboardTableQueryBuilder = new DashboardTableQueryBuilder();
