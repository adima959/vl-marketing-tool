import type { DateRange } from '@/types/dashboard';
import { validateSortDirection } from './types';

interface QueryOptions {
  dateRange: DateRange;
  dimensions: string[]; // ['country', 'product', 'source']
  depth: number;        // 0, 1, or 2
  parentFilters?: Record<string, string>; // { country: 'DENMARK' } or { country: 'DENMARK', product: 'T-Formula' } or { country: 'DENMARK', product: 'T-Formula', source: 'Google' }
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
  limit?: number;
}

/**
 * Builds dynamic SQL queries for Dashboard hierarchical reporting
 *
 * Depth 0: Group by country
 * Depth 1: Group by country + product (filtered by parent country)
 * Depth 2: Group by country + product + source (filtered by parent country + product)
 */
export class DashboardQueryBuilder {
  /**
   * Maps dashboard dimension IDs to database columns
   */
  private readonly dimensionMap: Record<string, string> = {
    country: 'c.country',
    product: 'p.product_name',
    source: 'sr.source',
  };

  /**
   * Maps dashboard metric IDs to SQL expressions (for sorting)
   */
  private readonly metricMap: Record<string, string> = {
    customers: 'customer_count',
    subscriptions: 'subscription_count',
    trials: 'trial_count',
    trialsApproved: 'trials_approved_count',
    upsells: 'upsell_count',
  };

  /**
   * Builds parent filter WHERE clause
   * Handles "Unknown" values by converting them to IS NULL conditions
   */
  private buildParentFilters(
    parentFilters: Record<string, string> | undefined
  ): { whereClause: string; params: (string | number | boolean | null | Date)[] } {
    if (!parentFilters || Object.keys(parentFilters).length === 0) {
      return { whereClause: '', params: [] };
    }

    const params: (string | number | boolean | null | Date)[] = [];
    const conditions: string[] = [];

    // IMPORTANT: Use dimension order, not alphabetical
    if (parentFilters.country !== undefined) {
      if (parentFilters.country === 'Unknown') {
        conditions.push('c.country IS NULL');
      } else {
        conditions.push('c.country = ?');
        params.push(parentFilters.country);
      }
    }

    if (parentFilters.product !== undefined) {
      if (parentFilters.product === 'Unknown') {
        conditions.push('p.product_name IS NULL');
      } else {
        conditions.push('p.product_name = ?');
        params.push(parentFilters.product);
      }
    }

    if (parentFilters.source !== undefined) {
      if (parentFilters.source === 'Unknown') {
        conditions.push('sr.source IS NULL');
      } else {
        conditions.push('sr.source = ?');
        params.push(parentFilters.source);
      }
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
   * Build SELECT columns based on dimensions and depth
   * Returns columns for the current depth level
   */
  private buildSelectColumns(dimensions: string[], depth: number): string {
    const columns: string[] = [];
    for (let i = 0; i <= depth; i++) {
      const dim = dimensions[i];
      columns.push(this.dimensionMap[dim]);
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
      columns.push(this.dimensionMap[dim]);
    }
    return columns.join(', ');
  }

  /**
   * Build query for any depth level (consolidated from depth0/1/2)
   * Dynamically builds SELECT, GROUP BY, WHERE based on depth and parent filters
   */
  private buildDepthQuery(options: QueryOptions): { query: string; params: any[] } {
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

    const startDate = this.formatDateForMariaDB(dateRange.start, false);
    const endDate = this.formatDateForMariaDB(dateRange.end, true);

    const { whereClause, params: filterParams } = this.buildParentFilters(parentFilters);

    const selectColumns = this.buildSelectColumns(dimensions, depth);
    const groupByClause = this.buildGroupByClause(dimensions, depth);

    const query = `
      SELECT
        ${selectColumns},
        COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customer_count,
        COUNT(DISTINCT s.id) AS subscription_count,
        COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trial_count,
        COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS trials_approved_count,
        COUNT(DISTINCT uo.id) AS upsell_count
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN source sr ON sr.id = i.source_id
      LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
      WHERE s.date_create BETWEEN ? AND ?
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
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
  public buildTimeSeriesQuery(dateRange: DateRange): { query: string; params: any[] } {
    const startDate = this.formatDateForMariaDB(dateRange.start, false);
    const endDate = this.formatDateForMariaDB(dateRange.end, true);

    const query = `
      SELECT
        DATE(s.date_create) AS date,
        COUNT(DISTINCT CASE WHEN DATE(c.date_registered) = DATE(s.date_create) THEN s.customer_id END) AS customers,
        COUNT(DISTINCT s.id) AS subscriptions,
        COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END) AS trials,
        COUNT(DISTINCT CASE WHEN i.type = 1 AND i.is_marked = 1 THEN i.id END) AS trialsApproved,
        COUNT(DISTINCT uo.id) AS upsells
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN invoice uo ON uo.customer_id = s.customer_id
        AND uo.tag LIKE CONCAT('%parent-sub-id=', s.id, '%')
      WHERE s.date_create BETWEEN ? AND ?
        AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      GROUP BY DATE(s.date_create)
      ORDER BY date ASC
    `;

    return { query, params: [startDate, endDate] };
  }

  /**
   * Main entry point - builds query for any valid depth
   */
  public buildQuery(options: QueryOptions): { query: string; params: any[] } {
    const { depth, dimensions } = options;

    // Validate depth
    if (depth < 0 || depth >= dimensions.length) {
      throw new Error(`Invalid depth: ${depth}. Must be 0 to ${dimensions.length - 1}.`);
    }

    return this.buildDepthQuery(options);
  }
}

// Export singleton instance
export const dashboardQueryBuilder = new DashboardQueryBuilder();
