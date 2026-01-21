import type { QueryOptions } from './types';

/**
 * Builds dynamic SQL queries for hierarchical reporting
 */
export class QueryBuilder {
  /**
   * Maps dashboard dimension IDs to database column names in merged_ads_spending view
   */
  private readonly dimensionMap: Record<string, string> = {
    network: 'network',
    campaign: 'campaign_name',
    adset: 'adset_name',
    ad: 'ad_name',
    date: 'date',
  };

  /**
   * Maps dashboard metric IDs to SQL expressions
   */
  private readonly metricMap: Record<string, string> = {
    cost: 'cost',
    clicks: 'clicks',
    impressions: 'impressions',
    conversions: 'conversions',
    ctr: 'ctr_percent',
    cpc: 'cpc',
    cpm: 'cpm',
    conversionRate: 'conversion_rate',
    crmSubscriptions: 'crm_subscriptions',
    approvedSales: 'approved_sales',
  };

  /**
   * Builds parent filter WHERE clause
   */
  private buildParentFilters(
    parentFilters: Record<string, string> | undefined,
    paramOffset: number
  ): { whereClause: string; params: any[] } {
    if (!parentFilters || Object.keys(parentFilters).length === 0) {
      return { whereClause: '', params: [] };
    }

    const params: any[] = [];
    const conditions: string[] = [];

    Object.entries(parentFilters).forEach(([dimId, value]) => {
      const sqlColumn = this.dimensionMap[dimId];
      if (!sqlColumn) {
        throw new Error(`Unknown dimension in parent filter: ${dimId}`);
      }
      params.push(value);
      conditions.push(`${sqlColumn} = $${paramOffset + params.length}`);
    });

    return {
      whereClause: `AND ${conditions.join(' AND ')}`,
      params,
    };
  }

  /**
   * Builds the complete query for a given depth and filters
   */
  public buildQuery(options: QueryOptions): { query: string; params: any[] } {
    const {
      dateRange,
      dimensions,
      depth,
      parentFilters,
      sortBy = 'cost',
      sortDirection = 'DESC',
      limit = 1000,
    } = options;

    // Validate depth
    if (depth >= dimensions.length) {
      throw new Error(`Depth ${depth} exceeds dimensions length ${dimensions.length}`);
    }

    // Validate limit to prevent SQL injection
    const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));

    // Get current dimension
    const currentDimension = dimensions[depth];
    const sqlColumn = this.dimensionMap[currentDimension];

    if (!sqlColumn) {
      throw new Error(`Unknown dimension: ${currentDimension}`);
    }

    // Get sort column and direction
    // Special case: if current dimension is 'date', always sort by date DESC (newest first)
    const sortColumn = this.metricMap[sortBy] || 'clicks';
    const finalSortColumn = currentDimension === 'date' ? sqlColumn : sortColumn;
    const finalSortDirection = currentDimension === 'date' ? 'DESC' : sortDirection;

    // Build parameters
    const params: any[] = [
      dateRange.start.toISOString().split('T')[0], // $1
      dateRange.end.toISOString().split('T')[0],   // $2
    ];

    // Build parent filters
    const { whereClause, params: filterParams } = this.buildParentFilters(
      parentFilters,
      params.length
    );
    params.push(...filterParams);

    // Build final query using merged_ads_spending view
    // Note: We only sum raw metrics (cost, clicks, impressions, conversions)
    // and recalculate derived metrics (CTR, CPC, CPM) from the sums
    const query = `
      SELECT
        ${sqlColumn} AS dimension_value,
        ROUND(SUM(cost::numeric), 2) AS cost,
        SUM(clicks::integer) AS clicks,
        SUM(impressions::integer) AS impressions,
        ROUND(SUM(conversions::numeric), 0) AS conversions,
        ROUND(SUM(clicks::integer)::numeric / NULLIF(SUM(impressions::integer), 0), 4) AS ctr_percent,
        ROUND(SUM(cost::numeric) / NULLIF(SUM(clicks::integer), 0), 2) AS cpc,
        ROUND(SUM(cost::numeric) / NULLIF(SUM(impressions::integer), 0) * 1000, 2) AS cpm,
        ROUND(SUM(conversions::numeric) / NULLIF(SUM(impressions::integer), 0), 6) AS conversion_rate,
        COALESCE(SUM(crm_subscriptions::integer), 0) AS crm_subscriptions,
        COALESCE(SUM(approved_sales::integer), 0) AS approved_sales
      FROM merged_ads_spending
      WHERE date BETWEEN $1 AND $2
        ${whereClause}
      GROUP BY ${sqlColumn}
      ORDER BY ${finalSortColumn} ${finalSortDirection}
      LIMIT ${safeLimit}
    `;

    return { query, params };
  }
}

// Export singleton instance
export const queryBuilder = new QueryBuilder();
