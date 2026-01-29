import { serializeQueryParams } from '@/lib/types/api';
import type { QueryParams } from '@/lib/types/api';
import type { NewOrdersRow } from '@/types/newOrders';
import { normalizeError, createTimeoutError, createNetworkError } from '@/lib/types/errors';

interface NewOrdersQueryResponse {
  success: boolean;
  data?: NewOrdersRow[];
  error?: string;
}

/**
 * Fetch new orders data from API with timeout support
 */
export async function fetchNewOrdersData(
  params: QueryParams,
  timeoutMs: number = 30000
): Promise<NewOrdersRow[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Serialize params to request format (Date -> ISO string)
    const requestBody = serializeQueryParams(params);

    const response = await fetch('/api/new-orders/query', {
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

    const result: NewOrdersQueryResponse = await response.json();

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
