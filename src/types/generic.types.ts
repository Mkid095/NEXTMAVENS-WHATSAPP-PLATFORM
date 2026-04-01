/**
 * Generic Types
 * Reusable type definitions used across the application
 */

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}
