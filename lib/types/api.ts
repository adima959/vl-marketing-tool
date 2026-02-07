import type { ReportRow } from '@/types/report';

/**
 * Date range for queries
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Query parameters used by client-side code (with Date objects)
 */
export interface QueryParams {
  dateRange: DateRange;
  dimensions: string[];
  depth: number;
  parentFilters?: Record<string, string>;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

/**
 * Query request sent over the wire (with ISO date strings)
 */
export interface QueryRequest {
  dateRange: {
    start: string; // ISO date string
    end: string;   // ISO date string
  };
  dimensions: string[];
  depth: number;
  parentFilters?: Record<string, string>;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

/**
 * Query response from API
 */
export interface QueryResponse {
  success: boolean;
  data?: ReportRow[];
  error?: string;
  cached?: boolean;
}

/**
 * Type guard to check if response is valid QueryResponse
 */
export function isQueryResponse(data: unknown): data is QueryResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    typeof (data as any).success === 'boolean'
  );
}

/**
 * Format a Date as YYYY-MM-DD in local timezone (avoids UTC shift from toISOString)
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Serialize QueryParams (with Date objects) to QueryRequest (with date strings)
 */
export function serializeQueryParams(params: QueryParams): QueryRequest {
  return {
    ...params,
    dateRange: {
      start: formatLocalDate(params.dateRange.start),
      end: formatLocalDate(params.dateRange.end),
    },
  };
}

/**
 * Parse QueryRequest (with ISO strings) to QueryParams (with Date objects)
 */
export function parseQueryRequest(request: QueryRequest): QueryParams {
  return {
    ...request,
    dateRange: {
      start: new Date(request.dateRange.start),
      end: new Date(request.dateRange.end),
    },
  };
}
