/**
 * Global authentication error handler
 * Detects 401 errors and triggers auth error state
 */

// Global auth error callback
let globalAuthErrorCallback: ((hasError: boolean) => void) | null = null;

/**
 * Register the global auth error callback
 * Should be called once by AuthProvider on mount
 */
export function registerAuthErrorHandler(callback: (hasError: boolean) => void) {
  globalAuthErrorCallback = callback;
}

/**
 * Trigger auth error globally
 * Called by API clients when they receive 401 responses
 */
export function triggerAuthError() {
  if (globalAuthErrorCallback) {
    globalAuthErrorCallback(true);
  }
}

/**
 * Check if response is an authentication error (401)
 * Returns true if auth error detected
 */
export function isAuthError(statusCode: number): boolean {
  return statusCode === 401;
}
