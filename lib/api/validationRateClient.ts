import { normalizeError, createTimeoutError, createNetworkError, ErrorCode } from '@/lib/types/errors';
import { triggerError, isAuthError } from '@/lib/api/errorHandler';
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
 * Fetch validation rate data from API with timeout support.
 *
 * NOTE: This client doesn't use createQueryClient because the response
 * shape is non-standard (data + periodColumns at top level instead of
 * nested under .data).
 */
export async function fetchValidationRateData(
  params: ValidationRateClientParams,
  timeoutMs: number = 30000
): Promise<{ data: ValidationRateRow[]; periodColumns: TimePeriodColumn[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestBody = {
      rateType: params.rateType,
      dateRange: {
        start: formatLocalDate(params.dateRange.start),
        end: formatLocalDate(params.dateRange.end),
      },
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
      if (isAuthError(response.status)) {
        const authError: import('@/lib/types/errors').AppError = {
          name: 'AuthError',
          message: 'Your session has expired or is invalid. Please refresh your session to continue.',
          code: ErrorCode.AUTH_ERROR,
          statusCode: 401,
        };
        triggerError(authError);
      }
      const error = await response.json().catch(() => ({ error: `API request failed: ${response.statusText}` }));
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

    if (error instanceof Error && error.name === 'AbortError') {
      throw createTimeoutError();
    }

    throw normalizeError(error);
  }
}
