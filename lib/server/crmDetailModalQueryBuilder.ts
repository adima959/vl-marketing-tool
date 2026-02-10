import type { DateRange } from '@/types/dashboard';
import { CRM_JOINS, CRM_WHERE, OTS_JOINS, formatDateForMariaDB, buildPaginationClause, type DashboardDetailMetricId } from './crmMetrics';
import { FilterBuilder } from './queryBuilderUtils';

type SqlParam = string | number | boolean | null | Date;

interface TrackingIdTuple {
  campaign_id: string;
  adset_id: string;
  ad_id: string;
}

interface DetailQueryOptions {
  dateRange: DateRange;
  // Geography-based filters (Dashboard mode)
  country?: string;
  productName?: string;
  product?: string;
  source?: string;
  // Tracking-tuple filters (Marketing mode)
  trackingIdTuples?: TrackingIdTuple[];
  date?: string; // Specific date (ISO string) for date dimension filtering
  network?: string; // Network filter (e.g., 'Google Ads') for source matching
  /** If true, exclude deleted subscriptions (s.deleted = 0). Used by approval rate page. */
  excludeDeleted?: boolean;
  /** If true, exclude upsell invoices (i.tag NOT LIKE '%parent-sub-id=%'). Used by approval rate page. */
  excludeUpsellTags?: boolean;
  /** Rate type for validation rate pages (affects query logic for modal details) */
  rateType?: 'approval' | 'pay' | 'buy';
}

interface PaginationOptions {
  page: number;
  pageSize: number;
}

interface QueryResult {
  query: string;
  params: SqlParam[];
  countQuery: string;
  countParams: any[];
}

/**
 * Unified query builder for CRM detail modal records from MariaDB
 * Used when user clicks on a metric cell in Dashboard or Marketing Report
 * Supports both geography-based filtering (Dashboard) and tracking-tuple filtering (Marketing)
 */
export class CrmDetailModalQueryBuilder {
  /**
   * Filter builder for subscription-based queries (with COALESCE for alternative paths)
   */
  private readonly filterBuilder = new FilterBuilder({
    dbType: 'mariadb',
    dimensionMap: {
      country: {
        column: 'c.country',
        nullCheck: "(c.country IS NULL OR c.country = '')",
      },
      productName: 'COALESCE(pg.group_name, pg_sub.group_name)',
      product: 'COALESCE(p.product_name, p_sub.product_name)',
      source: 'COALESCE(sr.source, sr_sub.source)',
    },
  });

  /**
   * Filter builder for OTS queries (direct columns, no COALESCE)
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
   * Filter builder for upsell queries (uses trial subscription's product only)
   * Upsells are attributed to the trial subscription's product, not the upsell invoice's products
   */
  private readonly upsellFilterBuilder = new FilterBuilder({
    dbType: 'mariadb',
    dimensionMap: {
      country: {
        column: 'c.country',
        nullCheck: "(c.country IS NULL OR c.country = '')",
      },
      productName: 'pg_sub.group_name',
      product: 'p_sub.product_name',
      source: 'COALESCE(sr.source, sr_sub.source)',
    },
  });

  /**
   * Build WHERE clause from optional filters (country, product, source)
   * Handles "Unknown" values by converting them to IS NULL OR empty string conditions
   */
  private buildFilterClause(filters: DetailQueryOptions): { whereClause: string; params: SqlParam[] } {
    const parentFilters: Record<string, string> = {};
    if (filters.country) parentFilters.country = filters.country;
    if (filters.productName) parentFilters.productName = filters.productName;
    if (filters.product) parentFilters.product = filters.product;
    if (filters.source) parentFilters.source = filters.source;
    return this.filterBuilder.buildParentFilters(parentFilters);
  }

  /**
   * Build WHERE clause with case-insensitive country matching
   * Used by pay rate and buy rate pages to match CRM behavior
   */
  private buildFilterClauseCaseInsensitive(filters: DetailQueryOptions): { whereClause: string; params: SqlParam[] } {
    // For case-insensitive matching, we override country with LOWER()
    const params: SqlParam[] = [];
    const conditions: string[] = [];

    if (filters.country) {
      if (filters.country === 'Unknown') {
        conditions.push("(c.country IS NULL OR c.country = '')");
      } else {
        conditions.push('LOWER(c.country) = LOWER(?)');
        params.push(filters.country);
      }
    }

    // Use standard filter builder for other dimensions
    const parentFilters: Record<string, string> = {};
    if (filters.productName) parentFilters.productName = filters.productName;
    if (filters.product) parentFilters.product = filters.product;
    if (filters.source) parentFilters.source = filters.source;
    const otherFilters = this.filterBuilder.buildParentFilters(parentFilters);

    params.push(...otherFilters.params);
    if (otherFilters.whereClause) {
      // Remove AND prefix if it exists since we'll add it ourselves
      const clause = otherFilters.whereClause.replace(/^AND\s+/, '');
      if (clause) conditions.push(clause);
    }

    return {
      whereClause: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Build WHERE clause for standalone OTS queries.
   * OTS invoices don't go through subscription, so no COALESCE — direct column references.
   */
  private buildOtsFilterClause(filters: DetailQueryOptions): { whereClause: string; params: SqlParam[] } {
    const parentFilters: Record<string, string> = {};
    if (filters.country) parentFilters.country = filters.country;
    if (filters.productName) parentFilters.productName = filters.productName;
    if (filters.product) parentFilters.product = filters.product;
    if (filters.source) parentFilters.source = filters.source;
    return this.otsFilterBuilder.buildParentFilters(parentFilters);
  }

  /**
   * Build WHERE clause for upsell queries.
   * Upsells are attributed to the trial subscription's product, not the upsell invoice's products.
   */
  private buildUpsellFilterClause(filters: DetailQueryOptions): { whereClause: string; params: SqlParam[] } {
    const parentFilters: Record<string, string> = {};
    if (filters.country) parentFilters.country = filters.country;
    if (filters.productName) parentFilters.productName = filters.productName;
    if (filters.product) parentFilters.product = filters.product;
    if (filters.source) parentFilters.source = filters.source;
    return this.upsellFilterBuilder.buildParentFilters(parentFilters);
  }

  /**
   * Build WHERE clause from tracking ID tuples (Marketing mode)
   * Uses MariaDB row-value constructor for precise tuple matching
   */
  private buildTrackingTupleFilterClause(filters: DetailQueryOptions): { whereClause: string; params: SqlParam[] } {
    const params: SqlParam[] = [];
    const conditions: string[] = [];

    // Filter by tracking ID tuples from PostgreSQL
    if (filters.trackingIdTuples && filters.trackingIdTuples.length > 0) {
      const tuplePlaceholders = filters.trackingIdTuples.map(() => '(?, ?, ?)').join(', ');
      conditions.push(
        `(s.tracking_id_4, s.tracking_id_2, s.tracking_id) IN (${tuplePlaceholders})`
      );
      for (const tuple of filters.trackingIdTuples) {
        params.push(tuple.campaign_id, tuple.adset_id, tuple.ad_id);
      }
    }

    // Network/source filter (maps network to source using shared logic)
    if (filters.network) {
      const { buildSourceFilterParams } = require('./crmMetrics');
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
   * Smart filter clause builder - uses tracking tuples if present, otherwise geography filters
   * This allows the same query methods to work for both Dashboard and Marketing modes
   */
  private buildSmartFilterClause(filters: DetailQueryOptions): { whereClause: string; params: SqlParam[] } {
    // If tracking tuples are present, use Marketing mode (tracking-based filtering)
    if (filters.trackingIdTuples && filters.trackingIdTuples.length > 0) {
      return this.buildTrackingTupleFilterClause(filters);
    }
    // Otherwise use Dashboard mode (geography-based filtering)
    return this.buildFilterClause(filters);
  }

  /**
   * Smart upsell filter clause builder
   * For geography mode: uses trial subscription's product only (Dashboard fix)
   * For tracking mode: uses tracking tuple filter (Marketing)
   */
  private buildSmartUpsellFilterClause(filters: DetailQueryOptions): { whereClause: string; params: SqlParam[] } {
    // If tracking tuples are present, use Marketing mode (tracking-based filtering)
    if (filters.trackingIdTuples && filters.trackingIdTuples.length > 0) {
      return this.buildTrackingTupleFilterClause(filters);
    }
    // Otherwise use Dashboard mode with upsell-specific filtering (trial subscription product only)
    return this.buildUpsellFilterClause(filters);
  }

  /**
   * Get tracking validation WHERE clauses for Marketing mode
   * Returns empty string for Dashboard mode (geography)
   */
  private getTrackingValidation(filters: DetailQueryOptions): string {
    const isTrackingMode = filters.trackingIdTuples && filters.trackingIdTuples.length > 0;
    if (!isTrackingMode) return '';
    return `
      AND ${CRM_WHERE.deletedSubExclusion}
      AND ${CRM_WHERE.trackingIdValidation.join(' AND ')}
    `;
  }

  /**
   * Build query for Customers metric (new customers where registration date = subscription date)
   */
  private buildCustomersQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildSmartFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);
    const trackingValidation = this.getTrackingValidation(filters);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT
        s.id as id,
        s.id as subscriptionId,
        CONCAT(c.first_name, ' ', c.last_name) as customerName,
        c.email as customerEmail,
        c.id as customerId,
        COALESCE(MAX(sr.source), '(not set)') as source,
        s.tracking_id as trackingId1,
        s.tracking_id_2 as trackingId2,
        s.tracking_id_3 as trackingId3,
        s.tracking_id_4 as trackingId4,
        s.tracking_id_5 as trackingId5,
        COALESCE(MAX(i.total), s.trial_price, 0) as amount,
        s.date_create as date,
        GROUP_CONCAT(DISTINCT COALESCE(p.product_name, p_sub.product_name, '(not set)') SEPARATOR ', ') as productName,
        c.country,
        MAX(IF(i.is_marked = 1, TRUE, FALSE)) as isApproved,
        MAX(IF(i.on_hold_date IS NOT NULL, 1, 0)) as isOnHold,
        s.status as subscriptionStatus,
        MAX(cr.caption) as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialLeft}
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      ${CRM_JOINS.sourceFromInvoice}
      ${CRM_JOINS.sourceFromSubAlt}
      ${CRM_JOINS.cancelReason}
      WHERE s.date_create BETWEEN ? AND ?
        AND DATE(c.date_registered) = DATE(s.date_create)
        ${trackingValidation}
        ${whereClause}
      GROUP BY s.id
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    // Optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product || !!filters.productName;
    const needsSourceJoin = !!filters.source || !!filters.network;
    const needsInvoiceJoin = needsProductJoin || needsSourceJoin;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${needsInvoiceJoin ? CRM_JOINS.invoiceTrialLeft : ''}
      ${needsProductJoin ? `${CRM_JOINS.invoiceProduct} ${CRM_JOINS.product} ${CRM_JOINS.productSub} ${CRM_JOINS.productGroup} ${CRM_JOINS.productGroupSub}` : ''}
      ${needsSourceJoin ? `${CRM_JOINS.sourceFromInvoice} ${CRM_JOINS.sourceFromSubAlt}` : ''}
      WHERE s.date_create BETWEEN ? AND ?
        AND DATE(c.date_registered) = DATE(s.date_create)
        ${trackingValidation}
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
   * Build query for Subscriptions metric (all subscriptions)
   */
  private buildSubscriptionsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildSmartFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);
    const trackingValidation = this.getTrackingValidation(filters);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT
        s.id as id,
        s.id as subscriptionId,
        CONCAT(c.first_name, ' ', c.last_name) as customerName,
        c.email as customerEmail,
        c.id as customerId,
        COALESCE(MAX(sr.source), '(not set)') as source,
        s.tracking_id as trackingId1,
        s.tracking_id_2 as trackingId2,
        s.tracking_id_3 as trackingId3,
        s.tracking_id_4 as trackingId4,
        s.tracking_id_5 as trackingId5,
        COALESCE(MAX(i.total), s.trial_price, 0) as amount,
        s.date_create as date,
        GROUP_CONCAT(DISTINCT COALESCE(p.product_name, p_sub.product_name, '(not set)') SEPARATOR ', ') as productName,
        c.country,
        MAX(IF(i.is_marked = 1, TRUE, FALSE)) as isApproved,
        MAX(IF(i.on_hold_date IS NOT NULL, 1, 0)) as isOnHold,
        s.status as subscriptionStatus,
        MAX(cr.caption) as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialLeft}
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      ${CRM_JOINS.sourceFromInvoice}
      ${CRM_JOINS.sourceFromSubAlt}
      ${CRM_JOINS.cancelReason}
      WHERE s.date_create BETWEEN ? AND ?
        ${trackingValidation}
        ${whereClause}
      GROUP BY s.id
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    // Optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product || !!filters.productName;
    const needsSourceJoin = !!filters.source || !!filters.network;
    const needsInvoiceJoin = needsProductJoin || needsSourceJoin;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${needsInvoiceJoin ? CRM_JOINS.invoiceTrialLeft : ''}
      ${needsProductJoin ? `${CRM_JOINS.invoiceProduct} ${CRM_JOINS.product} ${CRM_JOINS.productSub} ${CRM_JOINS.productGroup} ${CRM_JOINS.productGroupSub}` : ''}
      ${needsSourceJoin ? `${CRM_JOINS.sourceFromInvoice} ${CRM_JOINS.sourceFromSubAlt}` : ''}
      WHERE s.date_create BETWEEN ? AND ?
        ${trackingValidation}
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
   * Build query for Trials metric (invoices where type = 1)
   * Optional filters: excludeDeleted, excludeUpsellTags (used by approval rate page)
   */
  private buildTrialsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildSmartFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);
    const trackingValidation = this.getTrackingValidation(filters);

    // Build optional filter conditions
    const deletedFilter = filters.excludeDeleted ? `AND ${CRM_WHERE.deletedSubExclusion}` : '';
    const tagFilter = filters.excludeUpsellTags ? `AND ${CRM_WHERE.upsellExclusion}` : '';

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT
        i.id as id,
        i.id as invoiceId,
        s.id as subscriptionId,
        CONCAT(c.first_name, ' ', c.last_name) as customerName,
        c.email as customerEmail,
        c.id as customerId,
        COALESCE(sr.source, '(not set)') as source,
        i.tracking_id as trackingId1,
        i.tracking_id_2 as trackingId2,
        i.tracking_id_3 as trackingId3,
        i.tracking_id_4 as trackingId4,
        i.tracking_id_5 as trackingId5,
        COALESCE(i.total, 0) as amount,
        i.order_date as date,
        GROUP_CONCAT(DISTINCT COALESCE(p.product_name, p_sub.product_name, '(not set)') SEPARATOR ', ') as productName,
        c.country,
        MAX(IF(i.is_marked = 1, TRUE, FALSE)) as isApproved,
        IF(i.on_hold_date IS NOT NULL, 1, 0) as isOnHold,
        s.status as subscriptionStatus,
        MAX(cr.caption) as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialInner}
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      ${CRM_JOINS.sourceFromInvoice}
      ${CRM_JOINS.sourceFromSubAlt}
      ${CRM_JOINS.cancelReason}
      WHERE s.date_create BETWEEN ? AND ?
        ${deletedFilter}
        ${tagFilter}
        ${trackingValidation}
        ${whereClause}
      GROUP BY i.id
      ORDER BY i.order_date DESC
      ${limitClause}
    `;

    // Optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product || !!filters.productName;
    const needsSourceJoin = !!filters.source || !!filters.network;

    const countQuery = `
      SELECT COUNT(DISTINCT i.id) as total
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialInner}
      ${needsProductJoin ? `${CRM_JOINS.invoiceProduct} ${CRM_JOINS.product} ${CRM_JOINS.productSub} ${CRM_JOINS.productGroup} ${CRM_JOINS.productGroupSub}` : ''}
      ${needsSourceJoin ? `${CRM_JOINS.sourceFromInvoice} ${CRM_JOINS.sourceFromSubAlt}` : ''}
      WHERE s.date_create BETWEEN ? AND ?
        ${deletedFilter}
        ${tagFilter}
        ${trackingValidation}
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
   * Build query for Trials Approved metric (invoices where type = 1 AND is_marked = 1)
   * Optional filters: excludeDeleted, excludeUpsellTags (used by approval rate page)
   */
  private buildTrialsApprovedQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildSmartFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);
    const trackingValidation = this.getTrackingValidation(filters);

    // Build optional filter conditions
    const deletedFilter = filters.excludeDeleted ? `AND ${CRM_WHERE.deletedSubExclusion}` : '';
    const tagFilter = filters.excludeUpsellTags ? `AND ${CRM_WHERE.upsellExclusion}` : '';

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT
        i.id as id,
        i.id as invoiceId,
        s.id as subscriptionId,
        CONCAT(c.first_name, ' ', c.last_name) as customerName,
        c.email as customerEmail,
        c.id as customerId,
        COALESCE(sr.source, '(not set)') as source,
        i.tracking_id as trackingId1,
        i.tracking_id_2 as trackingId2,
        i.tracking_id_3 as trackingId3,
        i.tracking_id_4 as trackingId4,
        i.tracking_id_5 as trackingId5,
        COALESCE(i.total, 0) as amount,
        i.order_date as date,
        GROUP_CONCAT(DISTINCT COALESCE(p.product_name, p_sub.product_name, '(not set)') SEPARATOR ', ') as productName,
        c.country,
        MAX(IF(i.is_marked = 1, TRUE, FALSE)) as isApproved,
        IF(i.on_hold_date IS NOT NULL, 1, 0) as isOnHold,
        s.status as subscriptionStatus,
        MAX(cr.caption) as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialInner} AND i.is_marked = 1
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      ${CRM_JOINS.sourceFromInvoice}
      ${CRM_JOINS.sourceFromSubAlt}
      ${CRM_JOINS.cancelReason}
      WHERE s.date_create BETWEEN ? AND ?
        ${deletedFilter}
        ${tagFilter}
        ${trackingValidation}
        ${whereClause}
      GROUP BY i.id
      ORDER BY i.order_date DESC
      ${limitClause}
    `;

    // Optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product || !!filters.productName;
    const needsSourceJoin = !!filters.source || !!filters.network;

    const countQuery = `
      SELECT COUNT(DISTINCT i.id) as total
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceTrialInner} AND i.is_marked = 1
      ${needsProductJoin ? `${CRM_JOINS.invoiceProduct} ${CRM_JOINS.product} ${CRM_JOINS.productSub} ${CRM_JOINS.productGroup} ${CRM_JOINS.productGroupSub}` : ''}
      ${needsSourceJoin ? `${CRM_JOINS.sourceFromInvoice} ${CRM_JOINS.sourceFromSubAlt}` : ''}
      WHERE s.date_create BETWEEN ? AND ?
        ${deletedFilter}
        ${tagFilter}
        ${trackingValidation}
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
   * Build query for OTS metric (one-time sale invoices where type = 3)
   */
  private buildOtsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildOtsFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    // OTS invoices are standalone (no subscription_id) — query from invoice directly
    const query = `
      SELECT
        i.id as id,
        i.id as invoiceId,
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
        COALESCE(i.total, 0) as amount,
        i.order_date as date,
        GROUP_CONCAT(DISTINCT COALESCE(p.product_name, '(not set)') SEPARATOR ', ') as productName,
        c.country,
        MAX(IF(i.is_marked = 1, TRUE, FALSE)) as isApproved,
        IF(i.on_hold_date IS NOT NULL, 1, 0) as isOnHold,
        NULL as subscriptionStatus,
        NULL as cancelReason,
        NULL as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM invoice i
      INNER JOIN customer c ON c.id = i.customer_id
      ${OTS_JOINS.invoiceProduct}
      ${OTS_JOINS.product}
      ${OTS_JOINS.productGroup}
      ${OTS_JOINS.source}
      WHERE ${CRM_WHERE.otsBase}
        AND i.order_date BETWEEN ? AND ?
        ${whereClause}
      GROUP BY i.id
      ORDER BY i.order_date DESC
      ${limitClause}
    `;

    const needsProductJoin = !!filters.product || !!filters.productName;
    const needsSourceJoin = !!filters.source || !!filters.network;

    const countQuery = `
      SELECT COUNT(DISTINCT i.id) as total
      FROM invoice i
      INNER JOIN customer c ON c.id = i.customer_id
      ${needsProductJoin ? `${OTS_JOINS.invoiceProduct} ${OTS_JOINS.product} ${OTS_JOINS.productGroup}` : ''}
      ${needsSourceJoin ? OTS_JOINS.source : ''}
      WHERE ${CRM_WHERE.otsBase}
        AND i.order_date BETWEEN ? AND ?
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
   * Build query for Upsells metric (invoices where type = 3 linked to parent subscription)
   * Supports both geography mode (Dashboard) and tracking mode (Marketing)
   */
  private buildUpsellsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildSmartUpsellFilterClause(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);

    // Add tracking validation for Marketing mode (excludes deleted subs and validates tracking IDs)
    const trackingValidation = this.getTrackingValidation(filters);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT
        uo.id as id,
        uo.id as invoiceId,
        s.id as subscriptionId,
        CONCAT(c.first_name, ' ', c.last_name) as customerName,
        c.email as customerEmail,
        c.id as customerId,
        COALESCE(sr.source, '(not set)') as source,
        uo.tracking_id as trackingId1,
        uo.tracking_id_2 as trackingId2,
        uo.tracking_id_3 as trackingId3,
        uo.tracking_id_4 as trackingId4,
        uo.tracking_id_5 as trackingId5,
        COALESCE(uo.total, 0) as amount,
        uo.order_date as date,
        GROUP_CONCAT(DISTINCT COALESCE(p.product_name, p_sub.product_name, '(not set)') SEPARATOR ', ') as productName,
        c.country,
        MAX(IF(uo.is_marked = 1, TRUE, FALSE)) as isApproved,
        IF(uo.on_hold_date IS NOT NULL, 1, 0) as isOnHold,
        s.status as subscriptionStatus,
        MAX(cr.caption) as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.upsellInner}
      LEFT JOIN invoice_product ip ON ip.invoice_id = uo.id
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      LEFT JOIN source sr ON sr.id = uo.source_id
      ${CRM_JOINS.sourceFromSubAlt}
      ${CRM_JOINS.cancelReason}
      WHERE s.date_create BETWEEN ? AND ?
        ${trackingValidation}
        ${whereClause}
      GROUP BY uo.id
      ORDER BY uo.order_date DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(uo.id) as total
      FROM subscription s
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.upsellInner}
      LEFT JOIN invoice_product ip ON ip.invoice_id = uo.id
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      LEFT JOIN source sr ON sr.id = uo.source_id
      ${CRM_JOINS.sourceFromSubAlt}
      WHERE s.date_create BETWEEN ? AND ?
        ${trackingValidation}
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
   * Build query for Pay Rate Trials metric (matches CRM logic)
   * Uses invoice_date, INNER JOIN invoice_proccessed, excludes refunds (type != 4)
   */
  private buildPayRateTrialsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClauseCaseInsensitive(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    // Build optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product;
    const needsSourceJoin = !!filters.source || !!filters.network;

    const query = `
      SELECT
        ipr.id as id,
        i.id as invoiceId,
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
        COALESCE(i.total, 0) as amount,
        i.invoice_date as date,
        GROUP_CONCAT(DISTINCT COALESCE(p.product_name, p_sub.product_name, '(not set)') SEPARATOR ', ') as productName,
        c.country,
        IF(ipr.date_paid IS NOT NULL, 1, 0) as isApproved,
        IF(i.on_hold_date IS NOT NULL, 1, 0) as isOnHold,
        s.status as subscriptionStatus,
        MAX(cr.caption) as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered,
        ipr.date_bought as dateBought,
        ipr.date_paid as datePaid
      FROM invoice i
      INNER JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id
      INNER JOIN subscription s ON i.subscription_id = s.id
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      ${CRM_JOINS.sourceFromSub}
      ${CRM_JOINS.sourceFromSubAlt}
      ${CRM_JOINS.cancelReason}
      WHERE i.invoice_date >= ? AND i.invoice_date <= ?
        AND i.type != 4
        ${whereClause}
      GROUP BY ipr.id
      ORDER BY i.invoice_date DESC
      ${limitClause}
    `;

    // Optimized count query - minimal JOINs based on filters
    const countQuery = `
      SELECT COUNT(DISTINCT ipr.id) as total
      FROM invoice i
      INNER JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id
      INNER JOIN subscription s ON i.subscription_id = s.id
      ${CRM_JOINS.customerInner}
      ${needsProductJoin ? `${CRM_JOINS.invoiceProduct} ${CRM_JOINS.product} ${CRM_JOINS.productSub} ${CRM_JOINS.productGroup} ${CRM_JOINS.productGroupSub}` : ''}
      ${needsSourceJoin ? `${CRM_JOINS.sourceFromSub} ${CRM_JOINS.sourceFromSubAlt}` : ''}
      WHERE i.invoice_date >= ? AND i.invoice_date <= ?
        AND i.type != 4
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
   * Build query for Buy Rate Trials metric (matches CRM logic)
   * Uses invoice_date, INNER JOIN invoice_proccessed, excludes refunds (type != 4)
   */
  private buildBuyRateTrialsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClauseCaseInsensitive(filters);
    const { limitClause, params: paginationParams } = buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    // Build optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product;
    const needsSourceJoin = !!filters.source || !!filters.network;

    const query = `
      SELECT
        ipr.id as id,
        i.id as invoiceId,
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
        COALESCE(i.total, 0) as amount,
        i.invoice_date as date,
        GROUP_CONCAT(DISTINCT COALESCE(p.product_name, p_sub.product_name, '(not set)') SEPARATOR ', ') as productName,
        c.country,
        IF(ipr.date_bought IS NOT NULL, 1, 0) as isApproved,
        IF(i.on_hold_date IS NOT NULL, 1, 0) as isOnHold,
        s.status as subscriptionStatus,
        MAX(cr.caption) as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered,
        ipr.date_bought as dateBought,
        ipr.date_paid as datePaid
      FROM invoice i
      INNER JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id
      INNER JOIN subscription s ON i.subscription_id = s.id
      ${CRM_JOINS.customerInner}
      ${CRM_JOINS.invoiceProduct}
      ${CRM_JOINS.product}
      ${CRM_JOINS.productSub}
      ${CRM_JOINS.productGroup}
      ${CRM_JOINS.productGroupSub}
      ${CRM_JOINS.sourceFromSub}
      ${CRM_JOINS.sourceFromSubAlt}
      ${CRM_JOINS.cancelReason}
      WHERE i.invoice_date >= ? AND i.invoice_date <= ?
        AND i.type != 4
        ${whereClause}
      GROUP BY ipr.id
      ORDER BY i.invoice_date DESC
      ${limitClause}
    `;

    // Optimized count query - minimal JOINs based on filters
    const countQuery = `
      SELECT COUNT(DISTINCT ipr.id) as total
      FROM invoice i
      INNER JOIN invoice_proccessed ipr ON ipr.invoice_id = i.id
      INNER JOIN subscription s ON i.subscription_id = s.id
      ${CRM_JOINS.customerInner}
      ${needsProductJoin ? `${CRM_JOINS.invoiceProduct} ${CRM_JOINS.product} ${CRM_JOINS.productSub} ${CRM_JOINS.productGroup} ${CRM_JOINS.productGroupSub}` : ''}
      ${needsSourceJoin ? `${CRM_JOINS.sourceFromSub} ${CRM_JOINS.sourceFromSubAlt}` : ''}
      WHERE i.invoice_date >= ? AND i.invoice_date <= ?
        AND i.type != 4
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
    metricId: DashboardDetailMetricId,
    filters: DetailQueryOptions,
    pagination?: PaginationOptions
  ): QueryResult {
    // Handle pay rate and buy rate trials with their specific query logic
    if (metricId === 'trials' && filters.rateType === 'pay') {
      return this.buildPayRateTrialsQuery(filters, pagination);
    }
    if (metricId === 'trials' && filters.rateType === 'buy') {
      return this.buildBuyRateTrialsQuery(filters, pagination);
    }

    switch (metricId) {
      case 'customers':
        return this.buildCustomersQuery(filters, pagination);
      case 'subscriptions':
        return this.buildSubscriptionsQuery(filters, pagination);
      case 'trials':
        return this.buildTrialsQuery(filters, pagination);
      case 'ots':
        return this.buildOtsQuery(filters, pagination);
      case 'trialsApproved':
        return this.buildTrialsApprovedQuery(filters, pagination);
      case 'upsells':
        return this.buildUpsellsQuery(filters, pagination);
      default:
        throw new Error(`Unknown metricId: ${metricId}`);
    }
  }
}

// Export singleton instance (supports both Dashboard and Marketing)
export const crmDetailModalQueryBuilder = new CrmDetailModalQueryBuilder();

// Backward compatibility export for Dashboard API
export const dashboardDrilldownQueryBuilder = crmDetailModalQueryBuilder;
