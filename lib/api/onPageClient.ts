import { serializeQueryParams } from '@/lib/types/api';
import type { QueryParams } from '@/lib/types/api';
import type { OnPageReportRow } from '@/types/onPageReport';
import { normalizeError, createTimeoutError, createNetworkError } from '@/lib/types/errors';

interface OnPageQueryResponse {
  success: boolean;
  data?: OnPageReportRow[];
  error?: string;
}

/**
 * Fetch on-page analysis data from API with timeout support
 */
export async function fetchOnPageData(
  params: QueryParams,
  timeoutMs: number = 30000
): Promise<OnPageReportRow[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestBody = serializeQueryParams(params);

    const response = await fetch('/api/on-page-analysis/query', {
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

    const result: OnPageQueryResponse = await response.json();

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
