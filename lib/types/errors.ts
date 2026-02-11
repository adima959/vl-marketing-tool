/**
 * Standard error codes for the application
 */
export enum ErrorCode {
  AUTH_ERROR = 'AUTH_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
}

/**
 * Application error interface with structured error information
 */
export interface AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: Record<string, unknown>;
}

/**
 * Type guard to check if error is an AppError (internal use only)
 */
function isAppError(error: unknown): error is AppError {
  return (
    error instanceof Error &&
    'code' in error &&
    'statusCode' in error &&
    typeof (error as any).code === 'string' &&
    typeof (error as any).statusCode === 'number'
  );
}

/**
 * Normalize any error to AppError format for consistent handling
 */
export function normalizeError(error: unknown): AppError {
  // Already an AppError
  if (isAppError(error)) {
    return error;
  }

  // Standard Error object
  if (error instanceof Error) {
    // Check for specific error types
    if (error.name === 'AbortError') {
      return {
        name: error.name,
        message: error.message || 'Request timeout',
        stack: error.stack,
        code: ErrorCode.TIMEOUT,
        statusCode: 408,
      };
    }

    // Generic error - explicitly copy properties since spread doesn't copy from prototype
    return {
      name: error.name,
      message: error.message || 'Unknown error',
      stack: error.stack,
      code: ErrorCode.SERVER_ERROR,
      statusCode: 500,
    };
  }

  // Unknown error type
  return {
    name: 'AppError',
    message: typeof error === 'string' ? error : 'Unknown error occurred',
    code: ErrorCode.SERVER_ERROR,
    statusCode: 500,
  };
}

/**
 * Create a validation error
 */
export function createValidationError(
  message: string,
  details?: Record<string, unknown>
): AppError {
  const error = new Error(message) as AppError;
  error.name = 'ValidationError';
  error.code = ErrorCode.VALIDATION_ERROR;
  error.statusCode = 400;
  error.details = details;
  return error;
}

/**
 * Create a database error
 */
export function createDatabaseError(
  message: string,
  details?: Record<string, unknown>
): AppError {
  const error = new Error(message) as AppError;
  error.name = 'DatabaseError';
  error.code = ErrorCode.DATABASE_ERROR;
  error.statusCode = 500;
  error.details = details;
  return error;
}

/**
 * Create a network error
 */
export function createNetworkError(
  message: string,
  details?: Record<string, unknown>
): AppError {
  const error = new Error(message) as AppError;
  error.name = 'NetworkError';
  error.code = ErrorCode.NETWORK_ERROR;
  error.statusCode = 503;
  error.details = details;
  return error;
}

/**
 * Create a timeout error
 */
export function createTimeoutError(
  message: string = 'Request timeout - please try a shorter date range',
  details?: Record<string, unknown>
): AppError {
  const error = new Error(message) as AppError;
  error.name = 'TimeoutError';
  error.code = ErrorCode.TIMEOUT;
  error.statusCode = 408;
  error.details = details;
  return error;
}

/**
 * Mask error details for client responses
 * Returns generic error messages to prevent information disclosure
 *
 * @param error - The original error
 * @param context - Optional context for server-side logging
 * @returns Sanitized error message safe for client exposure
 */
export function maskErrorForClient(
  error: unknown,
  context?: string
): { message: string; code: ErrorCode; statusCode: number } {
  const normalized = normalizeError(error);

  // Log full error details server-side
  if (context) {
    console.error(`[${context}] Error details:`, {
      message: normalized.message,
      code: normalized.code,
      statusCode: normalized.statusCode,
      details: normalized.details,
      stack: normalized.stack,
    });
  }

  // Return generic messages for clients based on error type
  const genericMessages: Record<ErrorCode, string> = {
    [ErrorCode.AUTH_ERROR]: 'Your session has expired or is invalid. Please refresh your session to continue.',
    [ErrorCode.VALIDATION_ERROR]: normalized.message, // Validation errors are safe to expose
    [ErrorCode.NOT_FOUND]: 'Resource not found',
    [ErrorCode.TIMEOUT]: normalized.message || 'Request timeout - please try again with a shorter date range',
    [ErrorCode.DATABASE_ERROR]: normalized.message || 'An error occurred while processing your request',
    [ErrorCode.NETWORK_ERROR]: normalized.message || 'Network error - please check your connection and try again',
    [ErrorCode.SERVER_ERROR]: 'An internal error occurred - please try again later',
  };

  return {
    message: genericMessages[normalized.code],
    code: normalized.code,
    statusCode: normalized.statusCode,
  };
}

/**
 * Log error with full details (server-side only)
 * Never expose these details to clients
 *
 * @param error - The error to log
 * @param context - Context/location where error occurred
 * @param additionalInfo - Additional debugging information
 */
export function logErrorDetails(
  error: unknown,
  context: string,
  additionalInfo?: Record<string, unknown>
): void {
  const normalized = normalizeError(error);

  console.error(`[${context}] Error occurred:`, {
    timestamp: new Date().toISOString(),
    message: normalized.message,
    code: normalized.code,
    statusCode: normalized.statusCode,
    details: normalized.details,
    stack: normalized.stack,
    ...additionalInfo,
  });

  // In production, this could also send to error tracking service (Sentry, DataDog, etc.)
}
