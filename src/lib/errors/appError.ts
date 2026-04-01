/**
 * Application Error Types
 * Normalized error structure for consistent error handling across the app
 */

import type { AxiosError } from 'axios';

export interface AppError {
  /** User-friendly error message */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** HTTP status code if applicable */
  status?: number;
  /** Additional error details (for debugging/logging) */
  details?: unknown;
  /** Original error (not sent to UI) */
  _original?: unknown;
}

/**
 * Normalize any error into AppError format
 * Handles Axios errors, network errors, and unknown types
 */
export function normalizeError(error: unknown): AppError {
  // Axios error with response
  if (isAxiosError(error)) {
    // Cast to any to avoid type issues with response shape
    const axiosError = error as any;
    return {
      message: axiosError.response?.data?.message || axiosError.message || 'Request failed',
      code: axiosError.response?.data?.code,
      status: axiosError.response?.status,
      details: axiosError.response?.data,
      _original: error,
    };
  }

  // Network error (no response)
  if (isNetworkError(error)) {
    return {
      message: 'Network error. Please check your connection and try again.',
      code: 'NETWORK_ERROR',
      details: error,
      _original: error,
    };
  }

  // Unknown error type
  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.name,
      details: error.stack,
      _original: error,
    };
  }

  // Fallback for any other type
  return {
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
    details: error,
    _original: error,
  };
}

/**
 * Type guard for Axios error
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in (error as Record<string, unknown>) &&
    (error as { isAxiosError: boolean }).isAxiosError === true
  );
}

/**
 * Type guard for network error (no response)
 */
function isNetworkError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    !('response' in (error as Record<string, unknown>))
  );
}

/**
 * Log error for debugging (development only)
 */
export function logError(error: AppError): void {
  if (import.meta.env.DEV) {
    console.error('[AppError]', {
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.details,
    });
  }
}
