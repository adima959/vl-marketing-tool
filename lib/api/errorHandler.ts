/**
 * Global error handler for the application
 * Provides a centralized mechanism for triggering and clearing errors
 * Replaces the old authErrorHandler.ts with support for all error types
 */

import { AppError } from '@/lib/types/errors';

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
