import type { DateRange } from '@/types/dashboard';

interface DetailQueryOptions {
  dateRange: DateRange;
  country?: string;
  productName?: string;
  product?: string;
  source?: string;
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
  params: any[];
  countQuery: string;
  countParams: any[];
}

/**
 * Query builder for fetching individual detail records from MariaDB
 * Used when user clicks on a metric cell to see underlying data
 */
export class DashboardDrilldownQueryBuilder {
  /**
   * Format date for MariaDB BETWEEN queries
   * Reuses pattern from dashboardQueryBuilder
   */
  private formatDateForMariaDB(date: Date, endOfDay: boolean): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const time = endOfDay ? '23:59:59' : '00:00:00';
    return `${year}-${month}-${day} ${time}`;
  }

  /**
   * Build WHERE clause from optional filters (country, product, source)
   * Handles "Unknown" values by converting them to IS NULL OR empty string conditions
   */
  private buildFilterClause(filters: DetailQueryOptions): { whereClause: string; params: any[] } {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.country) {
      if (filters.country === 'Unknown') {
        // Match both NULL and empty string values
        conditions.push("(c.country IS NULL OR c.country = '')");
      } else {
        conditions.push('c.country = ?');
        params.push(filters.country);
      }
    }

    if (filters.productName) {
      if (filters.productName === 'Unknown') {
        conditions.push('COALESCE(pg.group_name, pg_sub.group_name) IS NULL');
      } else {
        conditions.push('COALESCE(pg.group_name, pg_sub.group_name) = ?');
        params.push(filters.productName);
      }
    }

    if (filters.product) {
      if (filters.product === 'Unknown') {
        conditions.push('COALESCE(p.product_name, p_sub.product_name) IS NULL');
      } else {
        conditions.push('COALESCE(p.product_name, p_sub.product_name) = ?');
        params.push(filters.product);
      }
    }

    if (filters.source) {
      if (filters.source === 'Unknown') {
        conditions.push('COALESCE(sr.source, sr_sub.source) IS NULL');
      } else {
        conditions.push('COALESCE(sr.source, sr_sub.source) = ?');
        params.push(filters.source);
      }
    }

    return {
      whereClause: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Build WHERE clause with case-insensitive country matching
   * Used by pay rate and buy rate pages to match CRM behavior
   */
  private buildFilterClauseCaseInsensitive(filters: DetailQueryOptions): { whereClause: string; params: any[] } {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.country) {
      if (filters.country === 'Unknown') {
        conditions.push("(c.country IS NULL OR c.country = '')");
      } else {
        // Case-insensitive matching for country (matches CRM behavior)
        conditions.push('LOWER(c.country) = LOWER(?)');
        params.push(filters.country);
      }
    }

    if (filters.productName) {
      if (filters.productName === 'Unknown') {
        conditions.push('COALESCE(pg.group_name, pg_sub.group_name) IS NULL');
      } else {
        conditions.push('COALESCE(pg.group_name, pg_sub.group_name) = ?');
        params.push(filters.productName);
      }
    }

    if (filters.product) {
      if (filters.product === 'Unknown') {
        conditions.push('COALESCE(p.product_name, p_sub.product_name) IS NULL');
      } else {
        conditions.push('COALESCE(p.product_name, p_sub.product_name) = ?');
        params.push(filters.product);
      }
    }

    if (filters.source) {
      if (filters.source === 'Unknown') {
        conditions.push('COALESCE(sr.source, sr_sub.source) IS NULL');
      } else {
        conditions.push('COALESCE(sr.source, sr_sub.source) = ?');
        params.push(filters.source);
      }
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
  private buildOtsFilterClause(filters: DetailQueryOptions): { whereClause: string; params: any[] } {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.country) {
      if (filters.country === 'Unknown') {
        conditions.push("(c.country IS NULL OR c.country = '')");
      } else {
        conditions.push('c.country = ?');
        params.push(filters.country);
      }
    }

    if (filters.productName) {
      if (filters.productName === 'Unknown') {
        conditions.push('pg.group_name IS NULL');
      } else {
        conditions.push('pg.group_name = ?');
        params.push(filters.productName);
      }
    }

    if (filters.product) {
      if (filters.product === 'Unknown') {
        conditions.push('p.product_name IS NULL');
      } else {
        conditions.push('p.product_name = ?');
        params.push(filters.product);
      }
    }

    if (filters.source) {
      if (filters.source === 'Unknown') {
        conditions.push('sr.source IS NULL');
      } else {
        conditions.push('sr.source = ?');
        params.push(filters.source);
      }
    }

    return {
      whereClause: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Build LIMIT and OFFSET clause for pagination
   */
  private buildPaginationClause(pagination?: PaginationOptions): { limitClause: string; params: any[] } {
    if (!pagination) {
      return { limitClause: 'LIMIT 50', params: [50] };
    }

    const offset = (pagination.page - 1) * pagination.pageSize;
    return {
      limitClause: 'LIMIT ? OFFSET ?',
      params: [pagination.pageSize, offset],
    };
  }

  /**
   * Build query for Customers metric (new customers where registration date = subscription date)
   */
  private buildCustomersQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

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
      INNER JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN product p_sub ON p_sub.id = s.product_id
      LEFT JOIN product_group pg ON pg.id = p.product_group_id
      LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        AND DATE(c.date_registered) = DATE(s.date_create)
        ${whereClause}
      GROUP BY s.id
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    // Optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product || !!filters.productName;
    const needsSourceJoin = !!filters.source;
    const needsInvoiceJoin = needsProductJoin || needsSourceJoin;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      ${needsInvoiceJoin ? 'LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0' : ''}
      ${needsProductJoin ? 'LEFT JOIN invoice_product ip ON ip.invoice_id = i.id LEFT JOIN product p ON p.id = ip.product_id LEFT JOIN product p_sub ON p_sub.id = s.product_id LEFT JOIN product_group pg ON pg.id = p.product_group_id LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id' : ''}
      ${needsSourceJoin ? 'LEFT JOIN source sr ON sr.id = i.source_id LEFT JOIN source sr_sub ON sr_sub.id = s.source_id' : ''}
      WHERE s.date_create BETWEEN ? AND ?
        AND DATE(c.date_registered) = DATE(s.date_create)
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
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

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
      INNER JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN product p_sub ON p_sub.id = s.product_id
      LEFT JOIN product_group pg ON pg.id = p.product_group_id
      LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        ${whereClause}
      GROUP BY s.id
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    // Optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product || !!filters.productName;
    const needsSourceJoin = !!filters.source;
    const needsInvoiceJoin = needsProductJoin || needsSourceJoin;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      ${needsInvoiceJoin ? 'LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0' : ''}
      ${needsProductJoin ? 'LEFT JOIN invoice_product ip ON ip.invoice_id = i.id LEFT JOIN product p ON p.id = ip.product_id LEFT JOIN product p_sub ON p_sub.id = s.product_id LEFT JOIN product_group pg ON pg.id = p.product_group_id LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id' : ''}
      ${needsSourceJoin ? 'LEFT JOIN source sr ON sr.id = i.source_id LEFT JOIN source sr_sub ON sr_sub.id = s.source_id' : ''}
      WHERE s.date_create BETWEEN ? AND ?
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
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

    // Build optional filter conditions
    const deletedFilter = filters.excludeDeleted ? 'AND s.deleted = 0' : '';
    const tagFilter = filters.excludeUpsellTags ? "AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')" : '';

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
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN product p_sub ON p_sub.id = s.product_id
      LEFT JOIN product_group pg ON pg.id = p.product_group_id
      LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        ${deletedFilter}
        ${tagFilter}
        ${whereClause}
      GROUP BY i.id
      ORDER BY i.order_date DESC
      ${limitClause}
    `;

    // Optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product || !!filters.productName;
    const needsSourceJoin = !!filters.source;

    const countQuery = `
      SELECT COUNT(DISTINCT i.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.deleted = 0
      ${needsProductJoin ? 'LEFT JOIN invoice_product ip ON ip.invoice_id = i.id LEFT JOIN product p ON p.id = ip.product_id LEFT JOIN product p_sub ON p_sub.id = s.product_id LEFT JOIN product_group pg ON pg.id = p.product_group_id LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id' : ''}
      ${needsSourceJoin ? 'LEFT JOIN source sr ON sr.id = i.source_id LEFT JOIN source sr_sub ON sr_sub.id = s.source_id' : ''}
      WHERE s.date_create BETWEEN ? AND ?
        ${deletedFilter}
        ${tagFilter}
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
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

    // Build optional filter conditions
    const deletedFilter = filters.excludeDeleted ? 'AND s.deleted = 0' : '';
    const tagFilter = filters.excludeUpsellTags ? "AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')" : '';

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
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.is_marked = 1 AND i.deleted = 0
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN product p_sub ON p_sub.id = s.product_id
      LEFT JOIN product_group pg ON pg.id = p.product_group_id
      LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        ${deletedFilter}
        ${tagFilter}
        ${whereClause}
      GROUP BY i.id
      ORDER BY i.order_date DESC
      ${limitClause}
    `;

    // Optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product || !!filters.productName;
    const needsSourceJoin = !!filters.source;

    const countQuery = `
      SELECT COUNT(DISTINCT i.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.is_marked = 1 AND i.deleted = 0
      ${needsProductJoin ? 'LEFT JOIN invoice_product ip ON ip.invoice_id = i.id LEFT JOIN product p ON p.id = ip.product_id LEFT JOIN product p_sub ON p_sub.id = s.product_id LEFT JOIN product_group pg ON pg.id = p.product_group_id LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id' : ''}
      ${needsSourceJoin ? 'LEFT JOIN source sr ON sr.id = i.source_id LEFT JOIN source sr_sub ON sr_sub.id = s.source_id' : ''}
      WHERE s.date_create BETWEEN ? AND ?
        ${deletedFilter}
        ${tagFilter}
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
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildOtsFilterClause(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

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
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN product_group pg ON pg.id = p.product_group_id
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE i.type = 3 AND i.deleted = 0
        AND i.order_date BETWEEN ? AND ?
        ${whereClause}
      GROUP BY i.id
      ORDER BY i.order_date DESC
      ${limitClause}
    `;

    const needsProductJoin = !!filters.product || !!filters.productName;
    const needsSourceJoin = !!filters.source;

    const countQuery = `
      SELECT COUNT(DISTINCT i.id) as total
      FROM invoice i
      INNER JOIN customer c ON c.id = i.customer_id
      ${needsProductJoin ? 'LEFT JOIN invoice_product ip ON ip.invoice_id = i.id LEFT JOIN product p ON p.id = ip.product_id LEFT JOIN product_group pg ON pg.id = p.product_group_id' : ''}
      ${needsSourceJoin ? 'LEFT JOIN source sr ON sr.id = i.source_id' : ''}
      WHERE i.type = 3 AND i.deleted = 0
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
   */
  private buildUpsellsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

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
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice uo ON uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
      LEFT JOIN invoice_product ip ON ip.invoice_id = uo.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN product p_sub ON p_sub.id = s.product_id
      LEFT JOIN product_group pg ON pg.id = p.product_group_id
      LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
      LEFT JOIN source sr ON sr.id = uo.source_id
      LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        ${whereClause}
      GROUP BY uo.id
      ORDER BY uo.order_date DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(uo.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice uo ON uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
      LEFT JOIN invoice_product ip ON ip.invoice_id = uo.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN product p_sub ON p_sub.id = s.product_id
      LEFT JOIN product_group pg ON pg.id = p.product_group_id
      LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
      LEFT JOIN source sr ON sr.id = uo.source_id
      LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
      WHERE s.date_create BETWEEN ? AND ?
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
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClauseCaseInsensitive(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    // Build optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product;
    const needsSourceJoin = !!filters.source;

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
      INNER JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN product p_sub ON p_sub.id = s.product_id
      LEFT JOIN product_group pg ON pg.id = p.product_group_id
      LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
      LEFT JOIN source sr ON s.source_id = sr.id
      LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
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
      INNER JOIN customer c ON s.customer_id = c.id
      ${needsProductJoin ? 'LEFT JOIN invoice_product ip ON ip.invoice_id = i.id LEFT JOIN product p ON p.id = ip.product_id LEFT JOIN product p_sub ON p_sub.id = s.product_id LEFT JOIN product_group pg ON pg.id = p.product_group_id LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id' : ''}
      ${needsSourceJoin ? 'LEFT JOIN source sr ON s.source_id = sr.id LEFT JOIN source sr_sub ON sr_sub.id = s.source_id' : ''}
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
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClauseCaseInsensitive(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    // Build optimized count query - only include JOINs needed for filters
    const needsProductJoin = !!filters.product;
    const needsSourceJoin = !!filters.source;

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
      INNER JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN product p_sub ON p_sub.id = s.product_id
      LEFT JOIN product_group pg ON pg.id = p.product_group_id
      LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
      LEFT JOIN source sr ON s.source_id = sr.id
      LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
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
      INNER JOIN customer c ON s.customer_id = c.id
      ${needsProductJoin ? 'LEFT JOIN invoice_product ip ON ip.invoice_id = i.id LEFT JOIN product p ON p.id = ip.product_id LEFT JOIN product p_sub ON p_sub.id = s.product_id LEFT JOIN product_group pg ON pg.id = p.product_group_id LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id' : ''}
      ${needsSourceJoin ? 'LEFT JOIN source sr ON s.source_id = sr.id LEFT JOIN source sr_sub ON sr_sub.id = s.source_id' : ''}
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
    metricId: string,
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

// Export singleton instance
export const dashboardDrilldownQueryBuilder = new DashboardDrilldownQueryBuilder();
