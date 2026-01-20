/**
 * Standard error codes for the application
 */
export enum ErrorCode {
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
 * Type guard to check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
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
        ...error,
        code: ErrorCode.TIMEOUT,
        statusCode: 408,
        message: error.message || 'Request timeout',
      };
    }

    // Generic error
    return {
      ...error,
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
  return {
    name: 'ValidationError',
    message,
    code: ErrorCode.VALIDATION_ERROR,
    statusCode: 400,
    details,
  };
}

/**
 * Create a database error
 */
export function createDatabaseError(
  message: string,
  details?: Record<string, unknown>
): AppError {
  return {
    name: 'DatabaseError',
    message,
    code: ErrorCode.DATABASE_ERROR,
    statusCode: 500,
    details,
  };
}

/**
 * Create a network error
 */
export function createNetworkError(
  message: string,
  details?: Record<string, unknown>
): AppError {
  return {
    name: 'NetworkError',
    message,
    code: ErrorCode.NETWORK_ERROR,
    statusCode: 503,
    details,
  };
}

/**
 * Create a timeout error
 */
export function createTimeoutError(
  message: string = 'Request timeout - please try a shorter date range',
  details?: Record<string, unknown>
): AppError {
  return {
    name: 'TimeoutError',
    message,
    code: ErrorCode.TIMEOUT,
    statusCode: 408,
    details,
  };
}
