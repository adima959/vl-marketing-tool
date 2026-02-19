/**
 * Validates that a sort direction value is either 'ASC' or 'DESC'.
 * Prevents SQL injection via ORDER BY clause interpolation,
 * since TypeScript types are not enforced at runtime.
 */
export function validateSortDirection(direction: string): 'ASC' | 'DESC' {
  if (direction === 'ASC' || direction === 'DESC') return direction;
  throw new Error(`Invalid sort direction: ${direction}`);
}

/**
 * Query options for building SQL
 */
export interface QueryOptions {
  dateRange: {
    start: Date;
    end: Date;
  };
  dimensions: string[];      // Array of dimension IDs
  depth: number;             // Current depth in hierarchy (0-based)
  parentFilters?: Record<string, string>; // Filters from parent rows (drill-down)
  filters?: Array<{ field: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>; // Top-level dimension filters
  sortBy?: string;           // Metric to sort by
  sortDirection?: 'ASC' | 'DESC';
  limit?: number;            // Max rows to return
}
