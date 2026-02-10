import type { DateRange } from '@/types';
import { buildSourceFilterParams, CRM_JOINS, CRM_WHERE, OTS_JOINS, formatDateForMariaDB, buildPaginationClause, type MarketingDetailMetricId } from './crmMetrics';

interface TrackingIdTuple {
  campaign_id: string;
  adset_id: string;
  ad_id: string;
}

interface DetailQueryOptions {
  dateRange: DateRange;
  trackingIdTuples: TrackingIdTuple[];
  date?: string;          // Specific date (ISO string) for date dimension filtering
  network?: string;       // Network filter (e.g., 'Google Ads') for source matching
}

interface PaginationOptions {
  page: number;
  pageSize: number;
}

interface QueryResult {
  query: string;
  params: any[];
  countQuery: string;
  countParams: any[];
}

/**
 * Query builder for fetching individual CRM detail records from MariaDB
 * Used when user clicks on CRM metrics in Marketing Report
 *
 * Filters CRM subscriptions using tracking ID tuples resolved from PostgreSQL.
 * Uses MariaDB row-value constructor for precise tuple matching:
 * (tracking_id_4, tracking_id_2, tracking_id) IN ((v1,v2,v3), ...)
 */
export class MarketingDetailQueryBuilder {
  /**
   * Build WHERE clause from tracking ID tuples
   * Uses MariaDB row-value constructor for precise tuple matching
   */
  private buildFilterClause(filters: DetailQueryOptions): { whereClause: string; params: any[] } {
    const params: any[] = [];
    const conditions: string[] = [];

    // Filter by tracking ID tuples from PostgreSQL
    if (filters.trackingIdTuples.length > 0) {
      const tuplePlaceholders = filters.trackingIdTuples.map(() => '(?, ?, ?)').join(', ');
      conditions.push(
        `(s.tracking_id_4, s.tracking_id_2, s.tracking_id) IN (${tuplePlaceholders})`
      );
      for (const tuple of filters.trackingIdTuples) {
        params.push(tuple.campaign_id, tuple.adset_id, tuple.ad_id);
      }
    }

    // Source/network filter — uses shared source matching from crmMetrics
    if (filters.network) {
      const sourceFilter = buildSourceFilterParams(filters.network);
      if (sourceFilter) {
        conditions.push(sourceFilter.whereClause);
        params.push(...sourceFilter.params);
      }
    }

    // Specific date filter (when date dimension is used)
    if (filters.date) {
      conditions.push('DATE(s.date_create) = DATE(?)');
      params.push(filters.date);
    }

    return {
      whereClause: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Build query for CRM Subscriptions metric (all subscriptions with tracking IDs)
   * This corresponds to subscription_count in marketingCrmQueries
   */
  private buildCrmSubscriptionsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT
        s.id as id,
        s.id as subscriptionId,
        CONCAT(c.first_name, ' ', c.last_name) as customerName,
        c.email as customerEmail,
        c.id as customerId,
        COALESCE(sr.source, '(not set)') as source,
        s.tracking_id as trackingId1,
        s.tracking_id_2 as trackingId2,
        s.tracking_id_3 as trackingId3,
        s.tracking_id_4 as trackingId4,
        s.tracking_id_5 as trackingId5,
        COALESCE(i.total, s.trial_price, 0) as amount,
        s.date_create as date,
        COALESCE(p.product_name, '(not set)') as productName,
        c.country,
        IF(i.is_marked = 1, TRUE, FALSE) as isApproved,
        MAX(IF(i.on_hold_date IS NOT NULL, 1, 0)) as isOnHold,
        s.status as subscriptionStatus,
        cr.caption as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialLeft}
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.sourceFromSub}
      ${CRM_JOINS.cancelReason}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.deletedSubExclusion}
        AND ${CRM_WHERE.upsellExclusion}
        AND ${CRM_WHERE.trackingIdValidation.join(' AND ')}
        ${whereClause}
      GROUP BY s.id
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialLeft}
      ${CRM_JOINS.sourceFromSub}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.deletedSubExclusion}
        AND ${CRM_WHERE.upsellExclusion}
        AND ${CRM_WHERE.trackingIdValidation.join(' AND ')}
        ${whereClause}
    `;

    return {
      query,
      params: [...baseParams, ...paginationParams],
      countQuery,
      countParams: baseParams,
    };
  }

  /**
   * Build query for Approved Sales metric (subscriptions with is_marked = 1)
   * This corresponds to approved_count in marketingCrmQueries
   */
  private buildApprovedSalesQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT
        s.id as id,
        s.id as subscriptionId,
        CONCAT(c.first_name, ' ', c.last_name) as customerName,
        c.email as customerEmail,
        c.id as customerId,
        COALESCE(sr.source, '(not set)') as source,
        s.tracking_id as trackingId1,
        s.tracking_id_2 as trackingId2,
        s.tracking_id_3 as trackingId3,
        s.tracking_id_4 as trackingId4,
        s.tracking_id_5 as trackingId5,
        COALESCE(i.total, s.trial_price, 0) as amount,
        s.date_create as date,
        COALESCE(p.product_name, '(not set)') as productName,
        c.country,
        IF(i.is_marked = 1, TRUE, FALSE) as isApproved,
        IF(i.on_hold_date IS NOT NULL, 1, 0) as isOnHold,
        s.status as subscriptionStatus,
        cr.caption as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialInner} AND i.is_marked = 1
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.sourceFromSub}
      ${CRM_JOINS.cancelReason}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.deletedSubExclusion}
        AND ${CRM_WHERE.upsellExclusion}
        AND ${CRM_WHERE.trackingIdValidation.join(' AND ')}
        ${whereClause}
      GROUP BY s.id
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialInner} AND i.is_marked = 1
      ${CRM_JOINS.sourceFromSub}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.deletedSubExclusion}
        AND ${CRM_WHERE.upsellExclusion}
        AND ${CRM_WHERE.trackingIdValidation.join(' AND ')}
        ${whereClause}
    `;

    return {
      query,
      params: [...baseParams, ...paginationParams],
      countQuery,
      countParams: baseParams,
    };
  }

  /**
   * Build WHERE clause for OTS detail queries.
   * OTS uses invoice-level tracking IDs (i.tracking_id_*), not subscription-level.
   */
  private buildOtsFilterClause(filters: DetailQueryOptions): { whereClause: string; params: any[] } {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.trackingIdTuples.length > 0) {
      const tuplePlaceholders = filters.trackingIdTuples.map(() => '(?, ?, ?)').join(', ');
      conditions.push(
        `(i.tracking_id_4, i.tracking_id_2, i.tracking_id) IN (${tuplePlaceholders})`
      );
      for (const tuple of filters.trackingIdTuples) {
        params.push(tuple.campaign_id, tuple.adset_id, tuple.ad_id);
      }
    }

    if (filters.network) {
      const sourceFilter = buildSourceFilterParams(filters.network);
      if (sourceFilter) {
        conditions.push(sourceFilter.whereClause);
        params.push(...sourceFilter.params);
      }
    }

    if (filters.date) {
      conditions.push('DATE(i.order_date) = DATE(?)');
      params.push(filters.date);
    }

    return {
      whereClause: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Build query for Customers metric (new customers where registration date = subscription date)
   */
  private buildCustomersQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT
        s.id as id,
        s.id as subscriptionId,
        CONCAT(c.first_name, ' ', c.last_name) as customerName,
        c.email as customerEmail,
        c.id as customerId,
        COALESCE(sr.source, '(not set)') as source,
        s.tracking_id as trackingId1,
        s.tracking_id_2 as trackingId2,
        s.tracking_id_3 as trackingId3,
        s.tracking_id_4 as trackingId4,
        s.tracking_id_5 as trackingId5,
        COALESCE(i.total, s.trial_price, 0) as amount,
        s.date_create as date,
        COALESCE(p.product_name, '(not set)') as productName,
        c.country,
        IF(i.is_marked = 1, TRUE, FALSE) as isApproved,
        MAX(IF(i.on_hold_date IS NOT NULL, 1, 0)) as isOnHold,
        s.status as subscriptionStatus,
        cr.caption as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialLeft}
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.sourceFromSub}
      ${CRM_JOINS.cancelReason}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.deletedSubExclusion}
        AND ${CRM_WHERE.upsellExclusion}
        AND DATE(c.date_registered) = DATE(s.date_create)
        AND ${CRM_WHERE.trackingIdValidation.join(' AND ')}
        ${whereClause}
      GROUP BY s.id
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialLeft}
      ${CRM_JOINS.sourceFromSub}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.deletedSubExclusion}
        AND ${CRM_WHERE.upsellExclusion}
        AND DATE(c.date_registered) = DATE(s.date_create)
        AND ${CRM_WHERE.trackingIdValidation.join(' AND ')}
        ${whereClause}
    `;

    return {
      query,
      params: [...baseParams, ...paginationParams],
      countQuery,
      countParams: baseParams,
    };
  }

  /**
   * Build query for OTS metric (one-time sale invoices, type=3)
   * OTS invoices have their own tracking IDs on the invoice, not via subscription.
   */
  private buildOtsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildOtsFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT
        i.id as id,
        NULL as subscriptionId,
        CONCAT(c.first_name, ' ', c.last_name) as customerName,
        c.email as customerEmail,
        c.id as customerId,
        COALESCE(sr.source, '(not set)') as source,
        i.tracking_id as trackingId1,
        i.tracking_id_2 as trackingId2,
        i.tracking_id_3 as trackingId3,
        i.tracking_id_4 as trackingId4,
        i.tracking_id_5 as trackingId5,
        i.total as amount,
        i.order_date as date,
        COALESCE(p.product_name, '(not set)') as productName,
        c.country,
        IF(i.is_marked = 1, TRUE, FALSE) as isApproved,
        IF(i.on_hold_date IS NOT NULL, 1, 0) as isOnHold,
        NULL as subscriptionStatus,
        NULL as cancelReason,
        NULL as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM invoice i
      ${OTS_JOINS.customer}
      ${OTS_JOINS.invoiceProduct}
      ${OTS_JOINS.product}
      ${OTS_JOINS.source}
      WHERE ${CRM_WHERE.otsBase}
        AND i.order_date BETWEEN ? AND ?
        AND ${CRM_WHERE.otsTrackingIdValidation.join(' AND ')}
        ${whereClause}
      GROUP BY i.id
      ORDER BY i.order_date DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT i.id) as total
      FROM invoice i
      ${OTS_JOINS.source}
      WHERE ${CRM_WHERE.otsBase}
        AND i.order_date BETWEEN ? AND ?
        AND ${CRM_WHERE.otsTrackingIdValidation.join(' AND ')}
        ${whereClause}
    `;

    return {
      query,
      params: [...baseParams, ...paginationParams],
      countQuery,
      countParams: baseParams,
    };
  }

  /**
   * Build query for Upsells metric (upsell invoices linked via tag pattern)
   */
  private buildUpsellsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT
        uo.id as id,
        s.id as subscriptionId,
        CONCAT(c.first_name, ' ', c.last_name) as customerName,
        c.email as customerEmail,
        c.id as customerId,
        COALESCE(sr.source, '(not set)') as source,
        s.tracking_id as trackingId1,
        s.tracking_id_2 as trackingId2,
        s.tracking_id_3 as trackingId3,
        s.tracking_id_4 as trackingId4,
        s.tracking_id_5 as trackingId5,
        uo.total as amount,
        uo.order_date as date,
        COALESCE(p.product_name, '(not set)') as productName,
        c.country,
        IF(uo.is_marked = 1, TRUE, FALSE) as isApproved,
        IF(uo.on_hold_date IS NOT NULL, 1, 0) as isOnHold,
        s.status as subscriptionStatus,
        NULL as cancelReason,
        NULL as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.upsellInner}
      LEFT JOIN invoice_product ip ON ip.invoice_id = uo.id
      ${CRM_JOINS.product}
      ${CRM_JOINS.sourceFromSub}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.deletedSubExclusion}
        AND ${CRM_WHERE.trackingIdValidation.join(' AND ')}
        ${whereClause}
      GROUP BY uo.id
      ORDER BY uo.order_date DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT uo.id) as total
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.upsellInner}
      ${CRM_JOINS.sourceFromSub}
      WHERE s.date_create BETWEEN ? AND ?
        AND ${CRM_WHERE.deletedSubExclusion}
        AND ${CRM_WHERE.trackingIdValidation.join(' AND ')}
        ${whereClause}
    `;

    return {
      query,
      params: [...baseParams, ...paginationParams],
      countQuery,
      countParams: baseParams,
    };
  }

  /**
   * Main entry point: routes to appropriate query builder based on metricId
   */
  public buildDetailQuery(
    metricId: MarketingDetailMetricId,
    filters: DetailQueryOptions,
    pagination?: PaginationOptions
  ): QueryResult {
    switch (metricId) {
      case 'crmSubscriptions':
      case 'trials':
        return this.buildCrmSubscriptionsQuery(filters, pagination);
      case 'approvedSales':
        return this.buildApprovedSalesQuery(filters, pagination);
      case 'customers':
        return this.buildCustomersQuery(filters, pagination);
      case 'ots':
        return this.buildOtsQuery(filters, pagination);
      case 'upsells':
        return this.buildUpsellsQuery(filters, pagination);
      default:
        throw new Error(`Unknown metricId: ${metricId}`);
    }
  }
}

// Export singleton instance
export const marketingDetailQueryBuilder = new MarketingDetailQueryBuilder();
