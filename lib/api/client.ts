import { serializeQueryParams } from '@/lib/types/api';
import type { QueryParams, QueryResponse } from '@/lib/types/api';
import type { ReportRow } from '@/types/report';
import { normalizeError, createTimeoutError, createNetworkError } from '@/lib/types/errors';

/**
 * Fetch report data from API with timeout support
 */
export async function fetchReportData(
  params: QueryParams,
  timeoutMs: number = 30000
): Promise<ReportRow[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Serialize params to request format (Date -> ISO string)
    const requestBody = serializeQueryParams(params);

    const response = await fetch('/api/reports/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json();
      throw createNetworkError(
        error.error || `API request failed: ${response.statusText}`,
        { statusCode: response.status }
      );
    }

    const result: QueryResponse = await response.json();

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
