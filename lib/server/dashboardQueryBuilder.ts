import type { DateRange } from '@/types/dashboard';

interface QueryOptions {
  dateRange: DateRange;
  dimensions: string[]; // ['country', 'product']
  depth: number;        // 0, 1, or 2
  parentFilters?: Record<string, string>; // { country: 'DENMARK' } or { country: 'DENMARK', product: 'T-Formula' }
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
  limit?: number;
}

/**
 * Builds dynamic SQL queries for Dashboard hierarchical reporting
 *
 * Depth 0: Group by country
 * Depth 1: Group by country + product (filtered by parent country)
 * Depth 2: Individual subscription rows (filtered by parent country + product)
 */
export class DashboardQueryBuilder {
  /**
   * Maps dashboard dimension IDs to database columns
   */
  private readonly dimensionMap: Record<string, string> = {
    country: 'c.country',
    product: 'p.product_name',
  };

  /**
   * Maps dashboard metric IDs to SQL expressions (for sorting)
   */
  private readonly metricMap: Record<string, string> = {
    subscriptions: 'subscription_count',
    ots: 'ots_count',
    trials: 'trial_count',
    customers: 'customer_count',
  };

  /**
   * Builds parent filter WHERE clause
   */
  private buildParentFilters(
    parentFilters: Record<string, string> | undefined
  ): { whereClause: string; params: any[] } {
    if (!parentFilters || Object.keys(parentFilters).length === 0) {
      return { whereClause: '', params: [] };
    }

    const params: any[] = [];
    const conditions: string[] = [];

    // IMPORTANT: Use dimension order, not alphabetical
    if (parentFilters.country !== undefined) {
      conditions.push('c.country = ?');
      params.push(parentFilters.country);
    }

    if (parentFilters.product !== undefined) {
      conditions.push('p.product_name = ?');
      params.push(parentFilters.product);
    }

    return {
      whereClause: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Format date for MariaDB DATETIME (YYYY-MM-DD HH:MM:SS)
   */
  private formatDateForMariaDB(date: Date, endOfDay: boolean = false): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    if (endOfDay) {
      return `${year}-${month}-${day} 23:59:59`;
    }
    return `${year}-${month}-${day} 00:00:00`;
  }

  /**
   * Build query for depth 0 (country aggregation)
   */
  private buildDepth0Query(options: QueryOptions): { query: string; params: any[] } {
    const { dateRange, sortBy = 'subscriptions', sortDirection = 'DESC', limit = 1000 } = options;

    const sortColumn = this.metricMap[sortBy] || 'subscription_count';
    const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));

    const startDate = this.formatDateForMariaDB(dateRange.start, false);
    const endDate = this.formatDateForMariaDB(dateRange.end, true);

    const query = `
      SELECT
        c.country,
        COUNT(DISTINCT s.id) AS subscription_count,
        SUM(CASE WHEN uo.type = 3 THEN 1 ELSE 0 END) AS ots_count,
        COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count,
        COUNT(DISTINCT s.customer_id) AS customer_count
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
        AND uo.type = 3
      WHERE s.date_create BETWEEN ? AND ?
      GROUP BY c.country
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT ${safeLimit}
    `;

    return { query, params: [startDate, endDate] };
  }

  /**
   * Build query for depth 1 (product aggregation within country)
   */
  private buildDepth1Query(options: QueryOptions): { query: string; params: any[] } {
    const {
      dateRange,
      parentFilters,
      sortBy = 'subscriptions',
      sortDirection = 'DESC',
      limit = 1000
    } = options;

    const sortColumn = this.metricMap[sortBy] || 'subscription_count';
    const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));

    const startDate = this.formatDateForMariaDB(dateRange.start, false);
    const endDate = this.formatDateForMariaDB(dateRange.end, true);

    const { whereClause, params: filterParams } = this.buildParentFilters(parentFilters);

    const query = `
      SELECT
        c.country,
        p.product_name,
        COUNT(DISTINCT s.id) AS subscription_count,
        SUM(CASE WHEN uo.type = 3 THEN 1 ELSE 0 END) AS ots_count,
        COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count,
        COUNT(DISTINCT s.customer_id) AS customer_count
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
        AND uo.type = 3
      WHERE s.date_create BETWEEN ? AND ?
        ${whereClause}
      GROUP BY c.country, p.product_name
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT ${safeLimit}
    `;

    const params = [startDate, endDate, ...filterParams];
    return { query, params };
  }

  /**
   * Build query for depth 2 (individual subscriptions)
   *
   * At depth 2, we GROUP BY subscription_id to get actual counts per subscription
   */
  private buildDepth2Query(options: QueryOptions): { query: string; params: any[] } {
    const {
      dateRange,
      parentFilters,
      sortBy = 'subscriptions',
      sortDirection = 'DESC',
      limit = 1000
    } = options;

    // For depth 2, default to subscription_id descending (newest first)
    const sortColumn = 'subscription_id';
    const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));

    const startDate = this.formatDateForMariaDB(dateRange.start, false);
    const endDate = this.formatDateForMariaDB(dateRange.end, true);

    const { whereClause, params: filterParams } = this.buildParentFilters(parentFilters);

    const query = `
      SELECT
        s.id AS subscription_id,
        c.country,
        p.product_name,
        sr.source,
        COUNT(DISTINCT CASE WHEN uo.type = 3 THEN uo.id END) AS ots_count,
        COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
        AND uo.type = 3
      WHERE s.date_create BETWEEN ? AND ?
        ${whereClause}
      GROUP BY s.id, c.country, p.product_name, sr.source
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT ${safeLimit}
    `;

    const params = [startDate, endDate, ...filterParams];
    return { query, params };
  }

  /**
   * Main entry point - routes to appropriate depth query
   */
  public buildQuery(options: QueryOptions): { query: string; params: any[] } {
    const { depth, dimensions } = options;

    // Validate depth
    if (depth < 0 || depth > 2) {
      throw new Error(`Invalid depth: ${depth}. Must be 0, 1, or 2.`);
    }

    // Validate dimensions
    if (depth >= dimensions.length) {
      throw new Error(`Depth ${depth} exceeds dimensions length ${dimensions.length}`);
    }

    switch (depth) {
      case 0:
        return this.buildDepth0Query(options);
      case 1:
        return this.buildDepth1Query(options);
      case 2:
        return this.buildDepth2Query(options);
      default:
        throw new Error(`Unsupported depth: ${depth}`);
    }
  }
}

// Export singleton instance
export const dashboardQueryBuilder = new DashboardQueryBuilder();
