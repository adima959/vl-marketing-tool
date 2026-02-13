/**
 * Global error handler for the application
 * Provides a centralized mechanism for triggering and clearing errors
 * Replaces the old authErrorHandler.ts with support for all error types
 */

import { AppError, createAuthError, normalizeError } from '@/lib/types/errors';

// Global error callback - set by AppContext on mount
let globalErrorCallback: ((error: AppError | null) => void) | null = null;

/**
 * Register the global error callback
 * Should be called once by AppProvider/AuthProvider on mount
 */
export function registerErrorHandler(callback: (error: AppError | null) => void): void {
  globalErrorCallback = callback;
}

/**
 * Trigger an error globally
 * Called by API clients, stores, or any component that encounters an error
 * The error will be displayed as a full-page ErrorPage component
 */
export function triggerError(error: AppError): void {
  if (globalErrorCallback) {
    globalErrorCallback(error);
  } else {
    console.error('[ErrorHandler] No global error callback registered. Error:', error);
  }
}

/**
 * Clear the current global error
 * Called when user clicks "Try Again" or when error is resolved
 */
export function clearError(): void {
  if (globalErrorCallback) {
    globalErrorCallback(null);
  }
}

/**
 * Check if a status code indicates an authentication error
 * Helper function for backward compatibility
 */
export function isAuthError(statusCode: number): boolean {
  return statusCode === 401;
}

/**
 * Throw an auth error.
 * Does NOT trigger the global error UI — callers handle auth errors
 * inline (settings pages) or via handleStoreError (stores).
 */
export function throwAuthError(includeContext: boolean = false): never {
  const error = createAuthError(includeContext);
  throw error;
}

/**
 * Check response for auth error and throw if found
 * Helper to check auth errors before parsing JSON
 */
export function checkAuthError(res: Response): void {
  if (isAuthError(res.status)) {
    throwAuthError();
  }
}

/**
 * Fetch JSON API endpoint with auth check and success validation.
 * Throws on auth error, non-success response, or network failure.
 * Returns the `data` field from `{ success: true, data: T }` responses.
 */
export async function fetchApi<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  checkAuthError(res);
  if (!res.ok) {
    let errorMessage = 'Request failed';
    try {
      const json = await res.json();
      errorMessage = json.error || errorMessage;
    } catch {
      errorMessage = res.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json.data as T;
}

/**
 * Standard error handler for store actions.
 * Normalizes, logs, and triggers the global error UI.
 */
export function handleStoreError(label: string, error: unknown): void {
  const appError = normalizeError(error);
  console.error(`Failed to ${label}:`, appError);
  triggerError(appError);
}
