import type { DateRange } from '@/types/dashboard';
import { validateSortDirection } from './types';
import { CRM_METRICS, OTS_METRICS, TRIAL_METRICS, CRM_JOINS, OTS_JOINS, CRM_WHERE, formatDateForMariaDB } from './crmMetrics';
import { FilterBuilder } from './queryBuilderUtils';
import { executeMariaDBQuery } from './mariadb';

type SqlParam = string | number | boolean | null | Date;

/**
 * CRM query result types - shared between Dashboard and Marketing Report
 * These match the aliases defined in crmMetrics.ts
 *
 * ⚠️ IMPORTANT: These types are the single source of truth for CRM query results.
 * Both Dashboard and Marketing Report import these types. If field names change,
 * TypeScript will catch mismatches at compile time.
 *
 * Business rules for what counts as a trial/subscription are defined in:
 * - SQL level: crmMetrics.ts (WHERE clauses like notDeletedInvoice, notUpsellTagged)
 * - JS level: crmFilters.ts (validation functions like isEligibleForTrialCount)
 * - Documentation: docs/crm-business-rules.md
 *
 * When updating business logic (e.g., "exclude deleted invoices"), update ALL three places
 * to maintain consistency between Dashboard and Marketing Report.
 *
 * Note: Fields like source, campaign_id, etc. are only present in tracking mode queries.
 * Use these types with Partial<> for geography mode or check for existence before access.
 */
export interface CRMSubscriptionRow {
  source: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  date: string;
  customer_count: number;
  subscription_count: number;
  trial_count: number;
  trials_approved_count: number;
  upsell_count: number;
  upsells_approved_count: number;
}

export interface CRMOtsRow {
  source: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  date: string;
  ots_count: number;
  ots_approved_count: number;
}

export interface CRMTrialRow {
  source: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  date: string;
  trial_count: number;
  trials_approved_count: number;
  on_hold_count: number;
}

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
   * Geography mode dimension mappings for OTS/Trial queries (invoice-based).
   * Uses COALESCE to fall back to subscription fields when invoice fields are NULL.
   */
  private readonly geographyOtsDimensions: Record<string, { selectExpr: string; groupByExpr: string }> = {
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
   * Tracking mode dimension mappings (Marketing) — subscription table
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
   * Tracking mode dimension mappings for OTS/Trial (Marketing) — invoice table
   * with subscription fallback. Uses COALESCE(i.field, s.field) for tracking IDs.
   */
  private readonly otsTrackingDimensions: Record<string, { selectExpr: string; groupByExpr: string }> = {
    campaign: {
      selectExpr: 'COALESCE(i.tracking_id_4, s.tracking_id_4) AS campaign_id',
      groupByExpr: 'COALESCE(i.tracking_id_4, s.tracking_id_4)',
    },
    adset: {
      selectExpr: 'COALESCE(i.tracking_id_2, s.tracking_id_2) AS adset_id',
      groupByExpr: 'COALESCE(i.tracking_id_2, s.tracking_id_2)',
    },
    ad: {
      selectExpr: 'COALESCE(i.tracking_id, s.tracking_id) AS ad_id',
      groupByExpr: 'COALESCE(i.tracking_id, s.tracking_id)',
    },
    date: {
      selectExpr: 'DATE(i.order_date) AS date',
      groupByExpr: 'DATE(i.order_date)',
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
   * Filter builders for OTS queries in geography mode (invoice path only)
   */
  private readonly geographyOtsFilterBuilder = new FilterBuilder({
    dbType: 'mariadb',
    dimensionMap: {
      country: {
        column: 'c.country',
        nullCheck: "(c.country IS NULL OR c.country = '')",
      },
      productName: {
        column: 'pg.group_name',
      },
      product: {
        column: 'p.product_name',
      },
      source: {
        column: 'sr.source',
      },
    },
  });

  /**
   * Filter builders for tracking mode (subscription table)
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
   * Filter builders for tracking mode (OTS / invoice table)
   */
  private readonly otsTrackingFilterBuilder = new FilterBuilder({
    dbType: 'mariadb',
    dimensionMap: {
      campaign: 'i.tracking_id_4',
      adset: 'i.tracking_id_2',
      ad: 'i.tracking_id',
      date: 'DATE(i.order_date)',
    },
  });

  /**
   * Build SELECT or GROUP BY columns from a dimension map
   */
  private buildDimColumns(
    dimensions: string[],
    depth: number,
    dimMap: Record<string, { selectExpr: string; groupByExpr: string }>,
    mode: 'select' | 'groupBy',
    label: string
  ): string {
    const columns: string[] = [];
    for (let i = 0; i <= depth; i++) {
      const dim = dimensions[i];
      const config = dimMap[dim];
      if (!config) {
        throw new Error(`Unknown ${label} dimension: ${dim}`);
      }
      columns.push(mode === 'select' ? config.selectExpr : config.groupByExpr);
    }
    return mode === 'select' ? columns.join(',\n        ') : columns.join(', ');
  }

  /** Resolve dimension map for the given groupBy strategy */
  private getDimMap(groupBy: GroupByStrategy): Record<string, { selectExpr: string; groupByExpr: string }> {
    return groupBy.type === 'geography' ? this.geographyDimensions : this.trackingDimensions;
  }

  /**
   * Build parent filter WHERE clause
   */
  private buildParentFilters(
    parentFilters: Record<string, string> | undefined,
    groupBy: GroupByStrategy,
    queryType: 'subscription' | 'ots' = 'subscription'
  ): { whereClause: string; params: SqlParam[] } {
    let filterBuilder: FilterBuilder;
    if (groupBy.type === 'tracking') {
      filterBuilder = queryType === 'ots' ? this.otsTrackingFilterBuilder : this.trackingFilterBuilder;
    } else if (queryType === 'ots') {
      filterBuilder = this.geographyOtsFilterBuilder;
    } else {
      filterBuilder = this.geographyFilterBuilder;
    }
    return filterBuilder.buildParentFilters(parentFilters);
  }

  /** Mode-specific JOINs and WHERE for subscription queries */
  private buildSubscriptionModeConfig(groupBy: GroupByStrategy, productFilter?: string): {
    invoiceJoin: string; trialCountExpr: string; trialsApprovedExpr: string;
    modeJoins: string; modeWhere: string; sourceColumn: string;
    sourceGroupBy: string; productFilterWhere: string; productFilterParams: SqlParam[];
  } {
    const isTracking = groupBy.type === 'tracking';
    return {
      invoiceJoin: CRM_JOINS.invoiceTrialLeft,
      trialCountExpr: CRM_METRICS.trialCount.leftJoinExpr,
      trialsApprovedExpr: CRM_METRICS.trialsApprovedCount.leftJoinExpr,
      modeJoins: isTracking ? `
      ${CRM_JOINS.sourceFromSub}
    ` : `
      LEFT JOIN (
        SELECT invoice_id, MIN(product_id) as product_id
        FROM invoice_product
        GROUP BY invoice_id
      ) ip ON ip.invoice_id = i.id
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      ${CRM_JOINS.sourceFromInvoice}
      ${CRM_JOINS.sourceFromSubAlt}
    `,
      modeWhere: '',
      sourceColumn: isTracking ? ',\n        sr.source AS source' : '',
      sourceGroupBy: isTracking ? ', sr.source' : '',
      productFilterWhere: isTracking && productFilter ? `
      AND EXISTS (
        SELECT 1 FROM invoice_product ip
        INNER JOIN product p ON p.id = ip.product_id
        WHERE ip.invoice_id = i.id AND p.product_name LIKE ?
      )
    ` : '',
      productFilterParams: isTracking && productFilter ? [productFilter] : [],
    };
  }

  /** Mode-specific JOINs and WHERE for OTS queries (with subscription fallback) */
  private buildOtsModeConfig(groupBy: GroupByStrategy): {
    modeJoins: string; modeWhere: string; sourceColumn: string;
    sourceGroupBy: string;
  } {
    const isTracking = groupBy.type === 'tracking';
    return {
      modeJoins: isTracking ? `
      ${OTS_JOINS.source}
      ${OTS_JOINS.subscription}
      ${OTS_JOINS.sourceFromSub}
    ` : `
      ${OTS_JOINS.customer}
      LEFT JOIN (
        SELECT invoice_id, MIN(product_id) as product_id
        FROM invoice_product
        GROUP BY invoice_id
      ) ip ON ip.invoice_id = i.id
      ${OTS_JOINS.product}
      ${OTS_JOINS.productGroup}
      ${OTS_JOINS.source}
      ${OTS_JOINS.subscription}
      ${OTS_JOINS.sourceFromSub}
      ${OTS_JOINS.productSub}
      ${OTS_JOINS.productGroupSub}
    `,
      modeWhere: `AND ${CRM_WHERE.upsellExclusion}`,
      sourceColumn: isTracking ? ',\n        COALESCE(sr.source, sr_sub.source) AS source' : '',
      sourceGroupBy: isTracking ? ', COALESCE(sr.source, sr_sub.source)' : '',
    };
  }

  /** Mode-specific JOINs and WHERE for trial queries (with subscription fallback) */
  private buildTrialModeConfig(groupBy: GroupByStrategy): {
    modeJoins: string; modeWhere: string; sourceColumn: string;
    sourceGroupBy: string;
  } {
    const isTracking = groupBy.type === 'tracking';
    return {
      modeJoins: isTracking ? `
      ${OTS_JOINS.source}
      ${OTS_JOINS.subscription}
      ${OTS_JOINS.sourceFromSub}
    ` : `
      ${OTS_JOINS.customer}
      LEFT JOIN (
        SELECT invoice_id, MIN(product_id) as product_id
        FROM invoice_product
        GROUP BY invoice_id
      ) ip ON ip.invoice_id = i.id
      ${OTS_JOINS.product}
      ${OTS_JOINS.productGroup}
      ${OTS_JOINS.source}
      ${OTS_JOINS.subscription}
      ${OTS_JOINS.sourceFromSub}
      ${OTS_JOINS.productSub}
      ${OTS_JOINS.productGroupSub}
    `,
      modeWhere: `AND ${CRM_WHERE.upsellExclusion}`,
      sourceColumn: isTracking ? ',\n        COALESCE(sr.source, sr_sub.source) AS source' : '',
      sourceGroupBy: isTracking ? ', COALESCE(sr.source, sr_sub.source)' : '',
    };
  }

  /**
   * Build subscription query with either geography or tracking grouping
   *
   * Both modes use LEFT JOIN for invoice (unified behavior).
   * Key differences:
   * - Geography: COALESCE for product/source paths (invoice vs subscription fallback)
   * - Tracking: Tracking ID validation, source from subscription
   */
  public buildQuery(options: CRMQueryOptions): { query: string; params: SqlParam[] } {
    const { dateRange, groupBy, depth, parentFilters, sortBy = 'subscriptions', sortDirection = 'DESC', productFilter, limit = 1000 } = options;

    if (depth < 0 || depth >= groupBy.dimensions.length) {
      throw new Error(`Invalid depth: ${depth}. Must be 0 to ${groupBy.dimensions.length - 1}.`);
    }

    const sortColumn = this.metricMap[sortBy] || 'subscription_count';
    const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));
    const startDate = formatDateForMariaDB(dateRange.start, false);
    const endDate = formatDateForMariaDB(dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildParentFilters(parentFilters, groupBy);

    const dimMap = this.getDimMap(groupBy);
    const selectColumns = this.buildDimColumns(groupBy.dimensions, depth, dimMap, 'select', groupBy.type);
    const groupByClause = this.buildDimColumns(groupBy.dimensions, depth, dimMap, 'groupBy', groupBy.type);

    const mode = this.buildSubscriptionModeConfig(groupBy, productFilter);

    const query = `
      SELECT
        ${selectColumns},
        ${CRM_METRICS.customerCount.expr} AS ${CRM_METRICS.customerCount.alias},
        ${CRM_METRICS.subscriptionCount.expr} AS ${CRM_METRICS.subscriptionCount.alias},
        ${mode.trialCountExpr} AS ${CRM_METRICS.trialCount.alias},
        ${mode.trialsApprovedExpr} AS ${CRM_METRICS.trialsApprovedCount.alias},
        ${CRM_METRICS.upsellCount.expr} AS ${CRM_METRICS.upsellCount.alias},
        ${CRM_METRICS.upsellSubCount.expr} AS ${CRM_METRICS.upsellSubCount.alias},
        ${CRM_METRICS.upsellOtsCount.expr} AS ${CRM_METRICS.upsellOtsCount.alias},
        ${CRM_METRICS.upsellsApprovedCount.expr} AS ${CRM_METRICS.upsellsApprovedCount.alias}${mode.sourceColumn}
      FROM subscription s
      ${CRM_JOINS.customer}
      ${mode.invoiceJoin}
      ${mode.modeJoins}
      ${CRM_JOINS.upsell}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.upsellExclusion}
        ${mode.modeWhere}
        ${mode.productFilterWhere}
        ${whereClause}
      GROUP BY ${groupByClause}${mode.sourceGroupBy}
      ORDER BY ${sortColumn} ${validateSortDirection(sortDirection)}
      LIMIT ${safeLimit}
    `;

    return { query, params: [startDate, endDate, ...mode.productFilterParams, ...filterParams] };
  }

  /**
   * Build OTS query with either geography or tracking grouping
   */
  public buildOtsQuery(options: CRMQueryOptions): { query: string; params: SqlParam[] } {
    const { dateRange, groupBy, depth, parentFilters } = options;

    const startDate = formatDateForMariaDB(dateRange.start, false);
    const endDate = formatDateForMariaDB(dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildParentFilters(parentFilters, groupBy, 'ots');

    // OTS tracking uses invoice-table dimension map (i. prefix, order_date)
    const isTracking = groupBy.type === 'tracking';
    const otsDimMap = isTracking ? this.otsTrackingDimensions : this.geographyOtsDimensions;
    const selectColumns = this.buildDimColumns(groupBy.dimensions, depth, otsDimMap, 'select', 'OTS');
    const groupByClause = this.buildDimColumns(groupBy.dimensions, depth, otsDimMap, 'groupBy', 'OTS');

    const mode = this.buildOtsModeConfig(groupBy);

    const query = `
      SELECT
        ${selectColumns},
        ${OTS_METRICS.otsCount.expr} AS ${OTS_METRICS.otsCount.alias},
        ${OTS_METRICS.otsApprovedCount.expr} AS ${OTS_METRICS.otsApprovedCount.alias}${mode.sourceColumn}
      FROM invoice i
      ${mode.modeJoins}
      WHERE ${CRM_WHERE.otsBase}
        AND i.order_date BETWEEN ? AND ?
        ${mode.modeWhere}
        ${whereClause}
      GROUP BY ${groupByClause}${mode.sourceGroupBy}
    `;

    return { query, params: [startDate, endDate, ...filterParams] };
  }

  /**
   * Build subscription time series query (daily aggregation).
   * Only used by Dashboard (geography mode).
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
        ${CRM_METRICS.upsellSubCount.expr} AS upsellSub,
        ${CRM_METRICS.upsellOtsCount.expr} AS upsellOts,
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
   * Build OTS time series query (daily aggregation).
   * Only used by Dashboard (geography mode).
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

  /**
   * Build standalone trial query (invoice-based, geography or tracking mode).
   *
   * Matches CRM trial counting:
   * - Uses i.order_date for date attribution (not s.date_create)
   * - Excludes trials from upsell subscriptions (they appear in the upsell column)
   * - i.type = 1 AND i.deleted = 0
   *
   * Results override the main subscription query's trial_count and
   * trials_approved_count in the transform layer.
   */
  public buildTrialQuery(options: CRMQueryOptions): { query: string; params: SqlParam[] } {
    const { dateRange, groupBy, depth, parentFilters } = options;

    const startDate = formatDateForMariaDB(dateRange.start, false);
    const endDate = formatDateForMariaDB(dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildParentFilters(parentFilters, groupBy, 'ots');

    const isTracking = groupBy.type === 'tracking';
    const otsDimMap = isTracking ? this.otsTrackingDimensions : this.geographyOtsDimensions;
    const selectColumns = this.buildDimColumns(groupBy.dimensions, depth, otsDimMap, 'select', 'trial');
    const groupByClause = this.buildDimColumns(groupBy.dimensions, depth, otsDimMap, 'groupBy', 'trial');

    const mode = this.buildTrialModeConfig(groupBy);

    const query = `
      SELECT
        ${selectColumns},
        ${TRIAL_METRICS.trialCount.expr} AS ${TRIAL_METRICS.trialCount.alias},
        ${TRIAL_METRICS.trialsApprovedCount.expr} AS ${TRIAL_METRICS.trialsApprovedCount.alias},
        ${TRIAL_METRICS.onHoldCount.expr} AS ${TRIAL_METRICS.onHoldCount.alias}${mode.sourceColumn}
      FROM invoice i
      ${mode.modeJoins}
      WHERE ${CRM_WHERE.trialBase}
        AND i.order_date BETWEEN ? AND ?
        ${mode.modeWhere}
        ${whereClause}
      GROUP BY ${groupByClause}${mode.sourceGroupBy}
    `;

    return { query, params: [startDate, endDate, ...filterParams] };
  }

  /**
   * Build trial time series query (daily aggregation).
   * Uses i.order_date for date attribution, no upsell exclusion.
   * Only used by Dashboard (geography mode).
   */
  public buildTrialTimeSeriesQuery(dateRange: DateRange): { query: string; params: SqlParam[] } {
    const startDate = formatDateForMariaDB(dateRange.start, false);
    const endDate = formatDateForMariaDB(dateRange.end, true);

    const query = `
      SELECT
        DATE(i.order_date) AS date,
        ${TRIAL_METRICS.trialCount.expr} AS trials,
        ${TRIAL_METRICS.trialsApprovedCount.expr} AS trialsApproved,
        ${TRIAL_METRICS.onHoldCount.expr} AS onHold
      FROM invoice i
      WHERE ${CRM_WHERE.trialBase}
        AND i.order_date BETWEEN ? AND ?
      GROUP BY DATE(i.order_date)
      ORDER BY date ASC
    `;

    return { query, params: [startDate, endDate] };
  }
}

// Export singleton instance
export const crmQueryBuilder = new CRMQueryBuilder();

/**
 * Unified CRM data fetcher — single source of truth for CRM query orchestration.
 *
 * Runs 3 parallel queries (subscription + OTS + trial) and returns raw rows.
 * Both Dashboard and Marketing Report call this instead of building queries manually.
 *
 * Consumers apply their own merge strategy:
 * - Dashboard: geography map lookup (buildOtsMap, buildTrialMap)
 * - Marketing: tracking ID cross-product (buildCrmIndex, buildOtsIndex, buildTrialIndex)
 */
export async function fetchCrmData(options: CRMQueryOptions): Promise<{
  subscriptionRows: CRMSubscriptionRow[];
  otsRows: CRMOtsRow[];
  trialRows: CRMTrialRow[];
}> {
  const { query, params } = crmQueryBuilder.buildQuery(options);
  const { query: otsQuery, params: otsParams } = crmQueryBuilder.buildOtsQuery(options);
  const { query: trialQuery, params: trialParams } = crmQueryBuilder.buildTrialQuery(options);

  const [subscriptionRows, otsRows, trialRows] = await Promise.all([
    executeMariaDBQuery<CRMSubscriptionRow>(query, params),
    executeMariaDBQuery<CRMOtsRow>(otsQuery, otsParams),
    executeMariaDBQuery<CRMTrialRow>(trialQuery, trialParams),
  ]);

  return { subscriptionRows, otsRows, trialRows };
}

// ---------------------------------------------------------------------------
// Source-level CRM data (for marketing report source matching)
// ---------------------------------------------------------------------------

/**
 * Source-level CRM row types — aggregated by source only (no tracking IDs).
 * Used for accurate totals at the network dimension level, and for computing
 * the "Unknown" row gap at tracking-level dimensions.
 */
export interface SourceSubscriptionRow {
  source: string | null;
  customer_count: number;
  subscription_count: number;
  upsell_count: number;
  upsells_approved_count: number;
}

export interface SourceOtsRow {
  source: string | null;
  ots_count: number;
  ots_approved_count: number;
}

export interface SourceTrialRow {
  source: string | null;
  trial_count: number;
  trials_approved_count: number;
  on_hold_count: number;
}

/**
 * Fetch CRM data aggregated by source (no tracking IDs).
 * Uses the same JOINs and business rules as tracking mode but groups by sr.source
 * for accurate COUNT(DISTINCT ...) at the source level.
 *
 * Used by:
 * - Marketing report network dimension: direct source matching (accurate totals)
 * - Marketing report other dimensions: computing "Unknown" row for unmatched gap
 */
export async function fetchSourceCrmData(options: {
  dateRange: DateRange;
  productFilter?: string;
  countryFilter?: string;
}): Promise<{
  subscriptionRows: SourceSubscriptionRow[];
  otsRows: SourceOtsRow[];
  trialRows: SourceTrialRow[];
}> {
  const startDate = formatDateForMariaDB(options.dateRange.start, false);
  const endDate = formatDateForMariaDB(options.dateRange.end, true);

  const productFilterWhere = options.productFilter ? `
      AND EXISTS (
        SELECT 1 FROM invoice_product ip_pf
        INNER JOIN product p_pf ON p_pf.id = ip_pf.product_id
        WHERE ip_pf.invoice_id = i.id AND p_pf.product_name LIKE ?
      )` : '';
  const productParams: SqlParam[] = options.productFilter ? [options.productFilter] : [];

  // Country filter — scopes source totals to a specific country (e.g., for Unknown row computation)
  const countryWhere = options.countryFilter ? `AND LOWER(c.country) = ?` : '';
  const countryParams: SqlParam[] = options.countryFilter ? [options.countryFilter.toLowerCase()] : [];

  const subQuery = `
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      ${CRM_METRICS.customerCount.expr} AS ${CRM_METRICS.customerCount.alias},
      ${CRM_METRICS.subscriptionCount.expr} AS ${CRM_METRICS.subscriptionCount.alias},
      ${CRM_METRICS.upsellCount.expr} AS ${CRM_METRICS.upsellCount.alias},
      ${CRM_METRICS.upsellsApprovedCount.expr} AS ${CRM_METRICS.upsellsApprovedCount.alias}
    FROM subscription s
    ${CRM_JOINS.customer}
    ${CRM_JOINS.invoiceTrialLeft}
    ${CRM_JOINS.sourceFromInvoice}
    ${CRM_JOINS.sourceFromSubAlt}
    ${CRM_JOINS.upsell}
    WHERE s.date_create BETWEEN ? AND ?
      AND ${CRM_WHERE.upsellExclusion}
      ${countryWhere}
      ${productFilterWhere}
    GROUP BY COALESCE(sr.source, sr_sub.source)
  `;

  const otsQuery = `
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      ${OTS_METRICS.otsCount.expr} AS ${OTS_METRICS.otsCount.alias},
      ${OTS_METRICS.otsApprovedCount.expr} AS ${OTS_METRICS.otsApprovedCount.alias}
    FROM invoice i
    ${OTS_JOINS.customer}
    ${OTS_JOINS.source}
    ${OTS_JOINS.subscription}
    ${OTS_JOINS.sourceFromSub}
    WHERE ${CRM_WHERE.otsBase}
      AND i.order_date BETWEEN ? AND ?
      AND ${CRM_WHERE.upsellExclusion}
      ${countryWhere}
    GROUP BY COALESCE(sr.source, sr_sub.source)
  `;

  const trialQuery = `
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      ${TRIAL_METRICS.trialCount.expr} AS ${TRIAL_METRICS.trialCount.alias},
      ${TRIAL_METRICS.trialsApprovedCount.expr} AS ${TRIAL_METRICS.trialsApprovedCount.alias},
      ${TRIAL_METRICS.onHoldCount.expr} AS ${TRIAL_METRICS.onHoldCount.alias}
    FROM invoice i
    ${OTS_JOINS.customer}
    ${OTS_JOINS.source}
    ${OTS_JOINS.subscription}
    ${OTS_JOINS.sourceFromSub}
    WHERE ${CRM_WHERE.trialBase}
      AND i.order_date BETWEEN ? AND ?
      AND ${CRM_WHERE.upsellExclusion}
      ${countryWhere}
    GROUP BY COALESCE(sr.source, sr_sub.source)
  `;

  const subParams = [startDate, endDate, ...countryParams, ...productParams];
  const invoiceParams = [startDate, endDate, ...countryParams];

  const [subscriptionRows, otsRows, trialRows] = await Promise.all([
    executeMariaDBQuery<SourceSubscriptionRow>(subQuery, subParams),
    executeMariaDBQuery<SourceOtsRow>(otsQuery, invoiceParams),
    executeMariaDBQuery<SourceTrialRow>(trialQuery, invoiceParams),
  ]);

  return { subscriptionRows, otsRows, trialRows };
}

// ---------------------------------------------------------------------------
// Source+Country CRM data (for marketing report country dimension matching)
// ---------------------------------------------------------------------------

export interface SourceCountrySubscriptionRow extends SourceSubscriptionRow {
  country: string;
}

export interface SourceCountryOtsRow extends SourceOtsRow {
  country: string;
}

export interface SourceCountryTrialRow extends SourceTrialRow {
  country: string;
}

/**
 * Fetch CRM data aggregated by source + country.
 * Like fetchSourceCrmData but adds LOWER(c.country) to GROUP BY so each
 * country gets its own accurate COUNT(DISTINCT ...) totals.
 *
 * Used by marketing report country dimension to avoid cross-country contamination
 * (a DK-classified campaign might have customers from multiple countries in CRM).
 */
export async function fetchSourceCountryCrmData(options: {
  dateRange: DateRange;
  productFilter?: string;
}): Promise<{
  subscriptionRows: SourceCountrySubscriptionRow[];
  otsRows: SourceCountryOtsRow[];
  trialRows: SourceCountryTrialRow[];
}> {
  const startDate = formatDateForMariaDB(options.dateRange.start, false);
  const endDate = formatDateForMariaDB(options.dateRange.end, true);

  const productFilterWhere = options.productFilter ? `
      AND EXISTS (
        SELECT 1 FROM invoice_product ip_pf
        INNER JOIN product p_pf ON p_pf.id = ip_pf.product_id
        WHERE ip_pf.invoice_id = i.id AND p_pf.product_name LIKE ?
      )` : '';
  const productParams: SqlParam[] = options.productFilter ? [options.productFilter] : [];

  const subQuery = `
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      LOWER(c.country) AS country,
      ${CRM_METRICS.customerCount.expr} AS ${CRM_METRICS.customerCount.alias},
      ${CRM_METRICS.subscriptionCount.expr} AS ${CRM_METRICS.subscriptionCount.alias},
      ${CRM_METRICS.upsellCount.expr} AS ${CRM_METRICS.upsellCount.alias},
      ${CRM_METRICS.upsellsApprovedCount.expr} AS ${CRM_METRICS.upsellsApprovedCount.alias}
    FROM subscription s
    ${CRM_JOINS.customer}
    ${CRM_JOINS.invoiceTrialLeft}
    ${CRM_JOINS.sourceFromInvoice}
    ${CRM_JOINS.sourceFromSubAlt}
    ${CRM_JOINS.upsell}
    WHERE s.date_create BETWEEN ? AND ?
      AND ${CRM_WHERE.upsellExclusion}
      ${productFilterWhere}
    GROUP BY COALESCE(sr.source, sr_sub.source), LOWER(c.country)
  `;

  const otsQuery = `
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      LOWER(c.country) AS country,
      ${OTS_METRICS.otsCount.expr} AS ${OTS_METRICS.otsCount.alias},
      ${OTS_METRICS.otsApprovedCount.expr} AS ${OTS_METRICS.otsApprovedCount.alias}
    FROM invoice i
    ${OTS_JOINS.customer}
    ${OTS_JOINS.source}
    ${OTS_JOINS.subscription}
    ${OTS_JOINS.sourceFromSub}
    WHERE ${CRM_WHERE.otsBase}
      AND i.order_date BETWEEN ? AND ?
      AND ${CRM_WHERE.upsellExclusion}
    GROUP BY COALESCE(sr.source, sr_sub.source), LOWER(c.country)
  `;

  const trialQuery = `
    SELECT
      COALESCE(sr.source, sr_sub.source) AS source,
      LOWER(c.country) AS country,
      ${TRIAL_METRICS.trialCount.expr} AS ${TRIAL_METRICS.trialCount.alias},
      ${TRIAL_METRICS.trialsApprovedCount.expr} AS ${TRIAL_METRICS.trialsApprovedCount.alias},
      ${TRIAL_METRICS.onHoldCount.expr} AS ${TRIAL_METRICS.onHoldCount.alias}
    FROM invoice i
    ${OTS_JOINS.customer}
    ${OTS_JOINS.source}
    ${OTS_JOINS.subscription}
    ${OTS_JOINS.sourceFromSub}
    WHERE ${CRM_WHERE.trialBase}
      AND i.order_date BETWEEN ? AND ?
      AND ${CRM_WHERE.upsellExclusion}
    GROUP BY COALESCE(sr.source, sr_sub.source), LOWER(c.country)
  `;

  const [subscriptionRows, otsRows, trialRows] = await Promise.all([
    executeMariaDBQuery<SourceCountrySubscriptionRow>(subQuery, [startDate, endDate, ...productParams]),
    executeMariaDBQuery<SourceCountryOtsRow>(otsQuery, [startDate, endDate]),
    executeMariaDBQuery<SourceCountryTrialRow>(trialQuery, [startDate, endDate]),
  ]);

  return { subscriptionRows, otsRows, trialRows };
}
