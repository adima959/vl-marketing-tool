import type { DateRange } from '@/types';

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
   * Format date for MariaDB BETWEEN queries
   */
  private formatDateForMariaDB(date: Date, endOfDay: boolean): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const time = endOfDay ? '23:59:59' : '00:00:00';
    return `${year}-${month}-${day} ${time}`;
  }

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

    // Source/network filter — mirrors matchSource() from marketingQueryBuilder
    if (filters.network) {
      const networkLower = filters.network.toLowerCase();
      if (networkLower === 'google ads') {
        conditions.push("LOWER(sr.source) IN ('adwords', 'google')");
      } else if (networkLower === 'facebook') {
        conditions.push("LOWER(sr.source) IN ('facebook', 'meta', 'fb')");
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
   * Build query for CRM Subscriptions metric (all subscriptions with tracking IDs)
   * This corresponds to subscription_count in marketingCrmQueries
   */
  private buildCrmSubscriptionsQuery(filters: DetailQueryOptions, pagination?: PaginationOptions): QueryResult {
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
        s.status as subscriptionStatus,
        cr.caption as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = s.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        AND s.deleted = 0
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
        AND s.tracking_id_4 IS NOT NULL
        AND s.tracking_id_4 != 'null'
        AND s.tracking_id_2 IS NOT NULL
        AND s.tracking_id_2 != 'null'
        AND s.tracking_id IS NOT NULL
        AND s.tracking_id != 'null'
        ${whereClause}
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = s.source_id
      WHERE s.date_create BETWEEN ? AND ?
        AND s.deleted = 0
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
        AND s.tracking_id_4 IS NOT NULL
        AND s.tracking_id_4 != 'null'
        AND s.tracking_id_2 IS NOT NULL
        AND s.tracking_id_2 != 'null'
        AND s.tracking_id IS NOT NULL
        AND s.tracking_id != 'null'
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
        s.status as subscriptionStatus,
        cr.caption as cancelReason,
        s.canceled_reason_about as cancelReasonAbout,
        c.date_registered as customerDateRegistered
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.is_marked = 1 AND i.deleted = 0
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = s.source_id
      LEFT JOIN subscription_cancel_reason scr ON scr.subscription_id = s.id
      LEFT JOIN cancel_reason cr ON cr.id = scr.cancel_reason_id
      WHERE s.date_create BETWEEN ? AND ?
        AND s.deleted = 0
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
        AND s.tracking_id_4 IS NOT NULL
        AND s.tracking_id_4 != 'null'
        AND s.tracking_id_2 IS NOT NULL
        AND s.tracking_id_2 != 'null'
        AND s.tracking_id IS NOT NULL
        AND s.tracking_id != 'null'
        ${whereClause}
      ORDER BY s.date_create DESC
      ${limitClause}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subscription s
      INNER JOIN customer c ON s.customer_id = c.id
      INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1 AND i.is_marked = 1 AND i.deleted = 0
      LEFT JOIN source sr ON sr.id = s.source_id
      WHERE s.date_create BETWEEN ? AND ?
        AND s.deleted = 0
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
        AND s.tracking_id_4 IS NOT NULL
        AND s.tracking_id_4 != 'null'
        AND s.tracking_id_2 IS NOT NULL
        AND s.tracking_id_2 != 'null'
        AND s.tracking_id IS NOT NULL
        AND s.tracking_id != 'null'
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
      case 'crmSubscriptions':
        return this.buildCrmSubscriptionsQuery(filters, pagination);
      case 'approvedSales':
        return this.buildApprovedSalesQuery(filters, pagination);
      default:
        throw new Error(`Unknown metricId: ${metricId}`);
    }
  }
}

// Export singleton instance
export const marketingDetailQueryBuilder = new MarketingDetailQueryBuilder();
