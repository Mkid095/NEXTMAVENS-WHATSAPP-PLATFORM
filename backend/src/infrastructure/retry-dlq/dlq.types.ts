/**
 * DLQ Specific Types
 */

import type { Job } from 'bullmq';

/**
 * Extended metadata stored with each DLQ entry
 */
export interface DlqMetadata {
  /** Original BullMQ job ID */
  originalJobId: string;
  /** Message type (job name) */
  messageType: string;
  /** Error message */
  error: string;
  /** Error category for filtering */
  errorCategory: string;
  /** Number of retry attempts made */
  retryCount: number;
  /** When the job failed (ISO string) */
  failedAt: string;
  /** Original job payload */
  payload: any;
  /** Job options (priority, etc.) */
  jobOptions?: {
    priority?: number;
    deduplication?: boolean;
  };
  /** Stack trace if available */
  stackTrace?: string;
}

/**
 * DLQ entry with Redis stream entry ID
 */
export interface DlqEntry {
  /** Redis stream entry ID */
  id: string;
  /** DLQ metadata */
  data: DlqMetadata;
}

/**
 * Query options for listing DLQ entries
 */
export interface DlqQueryOptions {
  /** Filter by message type (null = all) */
  messageType?: string | null;
  /** Filter by error category (null = all) */
  errorCategory?: string | null;
  /** Minimum retry count filter */
  minRetries?: number;
  /** Maximum number of results (default 50, max 100) */
  limit?: number;
  /** Pagination offset (Redis entry ID) */
  offset?: string;
  /** Sort order (default true = newest first) */
  newestFirst?: boolean;
}

/**
 * DLQ metrics for monitoring
 */
export interface DlqMetrics {
  /** Total entries across all streams */
  total: number;
  /** Breakdown by message type */
  byMessageType: Record<string, number>;
  /** Breakdown by error category */
  byErrorCategory: Record<string, number>;
  /** Breakdown by retry count buckets */
  byRetryCount: Record<string, number>;
}

/**
 * Result of a retry delay calculation
 */
export interface RetryDelayResult {
  /** Delay in milliseconds */
  delayMs: number;
  /** Which retry attempt this is (0-indexed) */
  attempt: number;
  /** Jitter applied */
  jitter: number;
}
