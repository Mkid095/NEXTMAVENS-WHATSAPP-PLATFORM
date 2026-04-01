/**
 * DLQ (Dead Letter Queue) Types
 *
 * Types for storing and querying failed messages.
 */

import { ErrorCategory } from './error-classification.types';

/**
 * Metadata stored with each DLQ entry
 */
export interface DlqMetadata {
  /** Original BullMQ job ID */
  originalJobId: string;
  /** Message type */
  messageType: string;
  /** Error that caused failure */
  error: string;
  /** Error classification */
  errorCategory: ErrorCategory;
  /** Number of retry attempts made */
  retryCount: number;
  /** Timestamp when job failed */
  failedAt: string;
  /** Original job payload */
  payload: Record<string, unknown>;
  /** Original job options (priority, etc.) */
  jobOptions?: {
    priority?: number;
    deduplication?: any;
  };
  /** Stack trace if available */
  stackTrace?: string;
}

/**
 * DLQ entry with Redis stream data
 */
export interface DlqEntry {
  /** Unique ID for the DLQ entry (Redis stream entry ID) */
  id: string;
  /** DLQ metadata as JSON */
  data: DlqMetadata;
}

/**
 * Query parameters for DLQ listing
 */
export interface DlqQueryOptions {
  /** Message type filter (optional) */
  messageType?: string;
  /** Error category filter (optional) */
  errorCategory?: ErrorCategory;
  /** Minimum retry count filter (optional) */
  minRetries?: number;
  /** Pagination limit */
  limit: number;
  /** Pagination offset (Redis stream ID) */
  offset?: string;
  /** Sort by failedAt descending (newest first) */
  newestFirst?: boolean;
}

/**
 * DLQ statistics
 */
export interface DlqMetrics {
  /** Total messages in DLQ */
  total: number;
  /** Count by message type */
  byMessageType: Record<string, number>;
  /** Count by error category */
  byErrorCategory: Record<string, number>;
  /** Count by retry count ranges */
  byRetryCount: Record<string, number>;
}
