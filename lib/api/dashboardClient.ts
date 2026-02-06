import { serializeQueryParams } from '@/lib/types/api';
import type { QueryParams } from '@/lib/types/api';
import type { DashboardRow, DateRange, TimeSeriesDataPoint, TimeSeriesResponse } from '@/types/dashboard';
import { normalizeError, createTimeoutError, createNetworkError } from '@/lib/types/errors';
import { triggerAuthError, isAuthError } from '@/lib/api/authErrorHandler';

interface DashboardQueryResponse {
  success: boolean;
  data?: DashboardRow[];
  error?: string;
}

/**
 * Fetch dashboard data from API with timeout support
 */
export async function fetchDashboardData(
  params: QueryParams,
  timeoutMs: number = 30000
): Promise<DashboardRow[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Serialize params to request format (Date -> ISO string)
    const requestBody = serializeQueryParams(params);

    const response = await fetch('/api/dashboard/query', {
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

    const result: DashboardQueryResponse = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }

    return result.data || [];
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

/**
 * Fetch time series data for dashboard chart
 */
export async function fetchDashboardTimeSeries(
  dateRange: DateRange,
  timeoutMs: number = 30000
): Promise<TimeSeriesDataPoint[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestBody = {
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
    };

    const response = await fetch('/api/dashboard/timeseries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (isAuthError(response.status)) {
        triggerAuthError();
      }

      const error = await response.json();
      throw createNetworkError(
        error.error || `API request failed: ${response.statusText}`,
        { statusCode: response.status }
      );
    }

    const result: TimeSeriesResponse = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }

    return result.data || [];
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw createTimeoutError();
    }

    throw normalizeError(error);
  }
}
