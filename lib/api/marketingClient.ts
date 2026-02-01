import { serializeQueryParams } from '@/lib/types/api';
import type { QueryParams, QueryResponse } from '@/lib/types/api';
import type { ReportRow } from '@/types/report';
import { normalizeError, createTimeoutError, createNetworkError } from '@/lib/types/errors';
import { triggerAuthError, isAuthError } from '@/lib/api/authErrorHandler';

/**
 * Fetch marketing report data from two-database API with timeout support
 * Uses PostgreSQL for ads data and MariaDB for CRM data with product filtering
 */
export async function fetchMarketingData(
  params: QueryParams & { productFilter?: string },
  timeoutMs: number = 30000
): Promise<ReportRow[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Serialize params to request format (Date -> ISO string)
    const requestBody = {
      ...serializeQueryParams(params),
      productFilter: params.productFilter, // Add product filter support
    };

    const response = await fetch('/api/marketing/query', {
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
