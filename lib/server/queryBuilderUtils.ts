/**
 * Shared query builder utilities
 * Consolidates common filter building patterns across query builders
 */

export type DbType = 'mariadb' | 'postgres';

export interface DimensionConfig {
  /** SQL column expression (can include COALESCE, etc.) */
  column: string;
  /** Optional null check override (e.g., "IS NULL OR column = ''") */
  nullCheck?: string;
}

export interface FilterBuilderConfig {
  /** Database type (affects placeholder style) */
  dbType: DbType;
  /** Dimension ID → SQL column mapping */
  dimensionMap: Record<string, DimensionConfig | string>;
  /** Starting parameter offset for PostgreSQL */
  paramOffset?: number;
}

export interface FilterResult {
  whereClause: string;
  params: any[];
}

/**
 * Generic filter builder supporting both MariaDB and PostgreSQL
 * Handles "Unknown" → IS NULL conversion and parameterized queries
 */
export class FilterBuilder {
  private config: FilterBuilderConfig;
  private paramCount: number;

  constructor(config: FilterBuilderConfig) {
    this.config = config;
    this.paramCount = 0;
  }

  /**
   * Build parent filter WHERE clause from dimension values
   *
   * @param parentFilters - Key-value pairs of dimension → value
   * @param options - Optional configuration
   * @returns Filter clause and parameters
   *
   * @example
   * // MariaDB
   * buildParentFilters({ country: 'US', product: 'Unknown' })
   * // Returns: { whereClause: 'AND c.country = ? AND p.name IS NULL', params: ['US'] }
   *
   * // PostgreSQL
   * buildParentFilters({ campaign: 'Summer Sale' }, { paramOffset: 2 })
   * // Returns: { whereClause: 'AND campaign_name = $3', params: ['Summer Sale'] }
   */
  buildParentFilters(
    parentFilters: Record<string, string> | undefined,
    options?: { paramOffset?: number; prefix?: string }
  ): FilterResult {
    if (!parentFilters || Object.keys(parentFilters).length === 0) {
      return { whereClause: '', params: [] };
    }

    const params: any[] = [];
    const conditions: string[] = [];
    const paramOffset = options?.paramOffset ?? this.config.paramOffset ?? 0;

    Object.entries(parentFilters).forEach(([dimId, value]) => {
      const dimConfig = this.config.dimensionMap[dimId];
      if (!dimConfig) {
        throw new Error(`Unknown dimension in parent filter: ${dimId}`);
      }

      const column = typeof dimConfig === 'string' ? dimConfig : dimConfig.column;
      const nullCheck = typeof dimConfig === 'string' ? undefined : dimConfig.nullCheck;

      // Handle "Unknown" values as NULL
      if (value === 'Unknown') {
        conditions.push(nullCheck ?? `${column} IS NULL`);
      } else {
        params.push(value);
        const placeholder = this.getPlaceholder(paramOffset + params.length);
        conditions.push(`${column} = ${placeholder}`);
      }
    });

    const prefix = options?.prefix ?? 'AND';
    return {
      whereClause: conditions.length > 0 ? `${prefix} ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Build table filter WHERE clause from user-defined filters
   * Supports operators: equals, not_equals, contains, not_contains
   *
   * @param filters - Array of filter conditions
   * @param options - Optional configuration
   * @returns Filter clause and parameters
   */
  buildTableFilters(
    filters: Array<{ field: string; operator: string; value: string }> | undefined,
    options?: { paramOffset?: number; prefix?: string; caseInsensitive?: boolean }
  ): FilterResult {
    if (!filters || filters.length === 0) {
      return { whereClause: '', params: [] };
    }

    const params: any[] = [];
    const conditions: string[] = [];
    const paramOffset = options?.paramOffset ?? this.config.paramOffset ?? 0;
    const caseInsensitive = options?.caseInsensitive ?? false;

    filters.forEach((filter) => {
      const dimConfig = this.config.dimensionMap[filter.field];
      if (!dimConfig) {
        throw new Error(`Unknown dimension in table filter: ${filter.field}`);
      }

      const column = typeof dimConfig === 'string' ? dimConfig : dimConfig.column;
      const nullCheck = typeof dimConfig === 'string' ? undefined : dimConfig.nullCheck;

      // Handle "Unknown" values for equals/not_equals
      if (filter.value === 'Unknown' && (filter.operator === 'equals' || filter.operator === 'not_equals')) {
        const isNullCondition = nullCheck ?? `${column} IS NULL`;
        conditions.push(filter.operator === 'equals' ? isNullCondition : `NOT (${isNullCondition})`);
        return;
      }

      // Build condition based on operator
      params.push(filter.value);
      const placeholder = this.getPlaceholder(paramOffset + params.length);
      const columnExpr = caseInsensitive ? `LOWER(${column})` : column;
      const valueExpr = caseInsensitive ? `LOWER(${placeholder})` : placeholder;

      switch (filter.operator) {
        case 'equals':
          conditions.push(`${columnExpr} = ${valueExpr}`);
          break;
        case 'not_equals':
          conditions.push(`${columnExpr} != ${valueExpr}`);
          break;
        case 'contains':
          conditions.push(`${columnExpr} LIKE CONCAT('%', ${valueExpr}, '%')`);
          break;
        case 'not_contains':
          conditions.push(`${columnExpr} NOT LIKE CONCAT('%', ${valueExpr}, '%')`);
          break;
        default:
          throw new Error(`Unknown filter operator: ${filter.operator}`);
      }
    });

    const prefix = options?.prefix ?? 'AND';
    return {
      whereClause: conditions.length > 0 ? `${prefix} ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Get placeholder string based on database type
   */
  private getPlaceholder(position: number): string {
    return this.config.dbType === 'postgres' ? `$${position}` : '?';
  }

  /**
   * Get current parameter count (useful for tracking offsets)
   */
  getParamCount(): number {
    return this.paramCount;
  }

  /**
   * Reset parameter count
   */
  resetParamCount(): void {
    this.paramCount = 0;
  }
}

/**
 * Helper: Build pagination clause (LIMIT + OFFSET)
 */
export function buildPaginationClause(
  page: number,
  pageSize: number,
  dbType: DbType = 'mariadb'
): string {
  const offset = (page - 1) * pageSize;
  return `LIMIT ${pageSize} OFFSET ${offset}`;
}

/**
 * Helper: Format date for MariaDB queries (YYYY-MM-DD)
 */
export function formatDateForMariaDB(date: Date): string {
  return date.toISOString().split('T')[0];
}
