import { normalizeError, createTimeoutError, createNetworkError } from '@/lib/types/errors';
import { triggerAuthError, isAuthError } from '@/lib/api/authErrorHandler';
import { formatLocalDate } from '@/lib/types/api';
import type {
  ValidationRateType,
  TimePeriod,
  ValidationRateRow,
  ValidationRateResponse,
  TimePeriodColumn,
} from '@/types';
import type { DateRange } from '@/types/report';

/**
 * Request parameters for validation rate API
 */
export interface ValidationRateClientParams {
  rateType: ValidationRateType;
  dateRange: DateRange;
  dimensions: string[];
  depth: number;
  parentFilters?: Record<string, string>;
  timePeriod: TimePeriod;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

/**
 * Serialize date range to ISO strings for API request
 */
function serializeDateRange(dateRange: DateRange): { start: string; end: string } {
  return {
    start: formatLocalDate(dateRange.start),
    end: formatLocalDate(dateRange.end),
  };
}

/**
 * Fetch validation rate data from API with timeout support
 * Queries MariaDB CRM for rates by dimension and time period
 * Supports all rate types: approval, pay, buy
 */
export async function fetchValidationRateData(
  params: ValidationRateClientParams,
  timeoutMs: number = 30000
): Promise<{ data: ValidationRateRow[]; periodColumns: TimePeriodColumn[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Serialize params to request format
    const requestBody = {
      rateType: params.rateType,
      dateRange: serializeDateRange(params.dateRange),
      dimensions: params.dimensions,
      depth: params.depth,
      parentFilters: params.parentFilters,
      timePeriod: params.timePeriod,
      sortBy: params.sortBy,
      sortDirection: params.sortDirection,
    };

    const response = await fetch('/api/validation-rate/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Handle authentication errors globally
      if (isAuthError(response.status)) {
        triggerAuthError();
      }

      const error = await response.json();
      throw createNetworkError(
        error.error || `API request failed: ${response.statusText}`,
        { statusCode: response.status }
      );
    }

    const result: ValidationRateResponse = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }

    return {
      data: result.data || [],
      periodColumns: result.periodColumns || [],
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      throw createTimeoutError();
    }

    // Normalize and re-throw
    throw normalizeError(error);
  }
}
