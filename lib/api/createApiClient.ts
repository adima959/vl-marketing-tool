import { normalizeError, createTimeoutError, createNetworkError, ErrorCode } from '@/lib/types/errors';
import { triggerError, isAuthError } from '@/lib/api/errorHandler';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Creates a typed POST API client with timeout, auth error handling, and
 * consistent error normalization.
 *
 * @param endpoint - API route path (e.g. '/api/dashboard/query')
 */
export function createQueryClient<TBody, TData>(
  endpoint: string
): (body: TBody, timeoutMs?: number) => Promise<TData> {
  return async (body: TBody, timeoutMs = 30000): Promise<TData> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

      const result: ApiResponse<TData> = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      if (result.data === undefined) {
        throw new Error('No data returned from API');
      }

      return result.data;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw createTimeoutError();
      }

      throw normalizeError(error);
    }
  };
}

/**
 * Creates a typed POST API client without timeout — for detail/drill-down
 * endpoints where AbortController isn't needed.
 */
export function createDetailClient<TBody, TData>(
  endpoint: string
): (body: TBody) => Promise<TData> {
  return async (body: TBody): Promise<TData> => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

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
      const error = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
      throw new Error(error.error || `HTTP error ${response.status}`);
    }

    const result: ApiResponse<TData> = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Unknown error occurred');
    }

    if (result.data === undefined) {
      throw new Error('No data returned from API');
    }

    return result.data;
  };
}
