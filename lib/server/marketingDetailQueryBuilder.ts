import type { DateRange } from '@/types';

interface DetailQueryOptions {
  dateRange: DateRange;
  network?: string;       // Maps to source (Google Ads -> adwords/google, Facebook -> facebook/meta)
  campaignIds?: string[]; // Array of campaign_ids (tracking_id_4) resolved from campaign names
  adsetIds?: string[];    // Array of adset_ids (tracking_id_2) resolved from adset names
  adIds?: string[];       // Array of ad_ids (tracking_id) resolved from ad names
  date?: string;          // Specific date (ISO string)
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
 */
export class MarketingDetailQueryBuilder {
  /**
   * Format date for MariaDB BETWEEN queries
   */
  private formatDateForMariaDB(date: Date, endOfDay: boolean): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = endOfDay ? '23:59:59' : '00:00:00';
    return `${year}-${month}-${day} ${time}`;
  }

  /**
   * Map network name to source values for filtering
   */
  private getSourcePatterns(network: string): string[] {
    const networkLower = network.toLowerCase();

    if (networkLower === 'google ads') {
      return ['adwords', 'google'];
    }

    if (networkLower === 'facebook') {
      return ['facebook', 'meta'];
    }

    // For other networks, try to match by name
    return [networkLower];
  }

  /**
   * Build WHERE clause from marketing filters
   * Uses resolved IDs from PostgreSQL to filter CRM data by tracking fields
   */
  private buildFilterClause(filters: DetailQueryOptions): { whereClause: string; params: any[] } {
    const params: any[] = [];
    const conditions: string[] = [];

    // Filter by network -> source mapping
    if (filters.network && filters.network !== 'Unknown') {
      const sourcePatterns = this.getSourcePatterns(filters.network);
      if (sourcePatterns.length === 1) {
        conditions.push('LOWER(sr.source) = LOWER(?)');
        params.push(sourcePatterns[0]);
      } else {
        const placeholders = sourcePatterns.map(() => 'LOWER(?)').join(', ');
        conditions.push(`LOWER(sr.source) IN (${placeholders})`);
        params.push(...sourcePatterns);
      }
    }

    // Filter by campaign IDs (tracking_id_4)
    if (filters.campaignIds && filters.campaignIds.length > 0) {
      const placeholders = filters.campaignIds.map(() => '?').join(', ');
      conditions.push(`s.tracking_id_4 IN (${placeholders})`);
      params.push(...filters.campaignIds);
    }

    // Filter by adset IDs (tracking_id_2)
    if (filters.adsetIds && filters.adsetIds.length > 0) {
      const placeholders = filters.adsetIds.map(() => '?').join(', ');
      conditions.push(`s.tracking_id_2 IN (${placeholders})`);
      params.push(...filters.adsetIds);
    }

    // Filter by ad IDs (tracking_id)
    if (filters.adIds && filters.adIds.length > 0) {
      const placeholders = filters.adIds.map(() => '?').join(', ');
      conditions.push(`s.tracking_id IN (${placeholders})`);
      params.push(...filters.adIds);
    }

    // Handle specific date filter (when date dimension is used)
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
