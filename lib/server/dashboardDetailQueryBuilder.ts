import type { DateRange } from '@/types/dashboard';

interface DetailQueryOptions {
  dateRange: DateRange;
  country?: string;
  product?: string;
  source?: string;
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
export class DashboardDetailQueryBuilder {
  /**
   * Format date for MariaDB BETWEEN queries
   * Reuses pattern from dashboardQueryBuilder
   */
  private formatDateForMariaDB(date: Date, endOfDay: boolean): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = endOfDay ? '23:59:59' : '00:00:00';
    return `${year}-${month}-${day} ${time}`;
  }

  /**
   * Build WHERE clause from optional filters (country, product, source)
   * Handles "Unknown" values by converting them to IS NULL conditions
   */
  private buildFilterClause(filters: DetailQueryOptions): { whereClause: string; params: any[] } {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.country) {
      if (filters.country === 'Unknown') {
        conditions.push('c.country IS NULL');
      } else {
        conditions.push('c.country = ?');
        params.push(filters.country);
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
      SELECT DISTINCT
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
        GROUP_CONCAT(DISTINCT p.product_name SEPARATOR ', ') as productName,
        c.country,
        IF(i.is_marked = 1, TRUE, FALSE) as isApproved,
        s.status as subscriptionStatus,
        cr.caption as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        AND DATE(c.date_registered) = DATE(s.date_create)
        ${whereClause}
      GROUP BY s.id, c.id, sr.source, s.tracking_id, s.tracking_id_2, s.tracking_id_3,
               s.tracking_id_4, s.tracking_id_5, i.total, s.trial_price, s.date_create,
               c.country, i.is_marked, s.status, cr.caption, s.canceled_reason_about,
               c.date_registered, c.first_name, c.last_name, c.email
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
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
      SELECT DISTINCT
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
        GROUP_CONCAT(DISTINCT p.product_name SEPARATOR ', ') as productName,
        c.country,
        IF(i.is_marked = 1, TRUE, FALSE) as isApproved,
        s.status as subscriptionStatus,
        cr.caption as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        ${whereClause}
      GROUP BY s.id, c.id, sr.source, s.tracking_id, s.tracking_id_2, s.tracking_id_3,
               s.tracking_id_4, s.tracking_id_5, i.total, s.trial_price, s.date_create,
               c.country, i.is_marked, s.status, cr.caption, s.canceled_reason_about,
               c.date_registered, c.first_name, c.last_name, c.email
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
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
   */
  private buildTrialsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT DISTINCT
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
        GROUP_CONCAT(DISTINCT p.product_name SEPARATOR ', ') as productName,
        c.country,
        IF(i.is_marked = 1, TRUE, FALSE) as isApproved,
        s.status as subscriptionStatus,
        cr.caption as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        ${whereClause}
      GROUP BY i.id, s.id, c.id, sr.source, i.tracking_id, i.tracking_id_2, i.tracking_id_3,
               i.tracking_id_4, i.tracking_id_5, i.total, i.order_date, c.country, i.is_marked,
               s.status, cr.caption, s.canceled_reason_about, c.date_registered, c.first_name, c.last_name, c.email
      ORDER BY i.order_date DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT i.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
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
   * Build query for Trials Approved metric (invoices where type = 1 AND is_marked = 1)
   */
  private buildTrialsApprovedQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT DISTINCT
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
        GROUP_CONCAT(DISTINCT p.product_name SEPARATOR ', ') as productName,
        c.country,
        IF(i.is_marked = 1, TRUE, FALSE) as isApproved,
        s.status as subscriptionStatus,
        cr.caption as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.is_marked = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        ${whereClause}
      GROUP BY i.id, s.id, c.id, sr.source, i.tracking_id, i.tracking_id_2, i.tracking_id_3,
               i.tracking_id_4, i.tracking_id_5, i.total, i.order_date, c.country, i.is_marked,
               s.status, cr.caption, s.canceled_reason_about, c.date_registered, c.first_name, c.last_name, c.email
      ORDER BY i.order_date DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT i.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.is_marked = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
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
   * Build query for Upsells metric (invoices where type = 3 linked to parent subscription)
   */
  private buildUpsellsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
    const startDate = this.formatDateForMariaDB(filters.dateRange.start, false);
    const endDate = this.formatDateForMariaDB(filters.dateRange.end, true);
    const { whereClause, params: filterParams } = this.buildFilterClause(filters);
    const { limitClause, params: paginationParams } = this.buildPaginationClause(pagination);

    const baseParams = [startDate, endDate, ...filterParams];

    const query = `
      SELECT DISTINCT
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
        GROUP_CONCAT(DISTINCT p.product_name SEPARATOR ', ') as productName,
        c.country,
        IF(uo.is_marked = 1, TRUE, FALSE) as isApproved,
        s.status as subscriptionStatus,
        cr.caption as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice uo ON uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
        AND uo.type = 3
      LEFT JOIN invoice_product ip ON ip.invoice_id = uo.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = uo.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        ${whereClause}
      GROUP BY uo.id, s.id, c.id, sr.source, uo.tracking_id, uo.tracking_id_2, uo.tracking_id_3,
               uo.tracking_id_4, uo.tracking_id_5, uo.total, uo.order_date, c.country, uo.is_marked,
               s.status, cr.caption, s.canceled_reason_about, c.date_registered, c.first_name, c.last_name, c.email
      ORDER BY uo.order_date DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(uo.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice uo ON uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
        AND uo.type = 3
      LEFT JOIN invoice_product ip ON ip.invoice_id = uo.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = uo.source_id
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
   * Main entry point: routes to appropriate query builder based on metricId
   */
  public buildDetailQuery(
    metricId: string,
    filters: DetailQueryOptions,
    pagination?: PaginationOptions
  ): QueryResult {
    switch (metricId) {
      case 'customers':
        return this.buildCustomersQuery(filters, pagination);
      case 'subscriptions':
        return this.buildSubscriptionsQuery(filters, pagination);
      case 'trials':
        return this.buildTrialsQuery(filters, pagination);
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
export const dashboardDetailQueryBuilder = new DashboardDetailQueryBuilder();
