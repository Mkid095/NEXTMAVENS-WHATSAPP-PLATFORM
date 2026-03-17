/**
 * Message Retry and DLQ System - Type Definitions
 * Provides comprehensive failure handling with exponential backoff and dead letter queues
 */

import type { Job } from 'bullmq';

// ============================================================================
// Retry Policy Types
// ============================================================================

/**
 * Configuration for retry behavior per message type
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts before moving to DLQ */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay between retries (cap for exponential growth) */
  maxDelayMs: number;
  /** Jitter factor (0-1) to add randomness and prevent thundering herd */
  jitterFactor: number;
}

/**
 * Default retry policies per message type
 * MESSAGE_UPSERT gets longer delays due to database operations
 * Critical operations may have different policies
 */
export const DEFAULT_RETRY_POLICIES: Record<string, RetryPolicy> = {
  MESSAGE_UPSERT: {
    maxRetries: 5,
    baseDelayMs: 1000,
    maxDelayMs: 300000, // 5 minutes
    jitterFactor: 0.15
  },
  MESSAGE_STATUS_UPDATE: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 60000, // 1 minute
    jitterFactor: 0.15
  },
  MESSAGE_DELETE: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 60000,
    jitterFactor: 0.15
  },
  INSTANCE_STATUS_UPDATE: {
    maxRetries: 2,
    baseDelayMs: 300,
    maxDelayMs: 30000,
    jitterFactor: 0.15
  },
  CONTACT_UPDATE: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 60000,
    jitterFactor: 0.15
  },
  ANALYTICS_EVENT: {
    maxRetries: 2,
    baseDelayMs: 200,
    maxDelayMs: 10000,
    jitterFactor: 0.15
  },
  WEBHOOK_EVENT: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    jitterFactor: 0.15
  },
  DATABASE_CLEANUP: {
    maxRetries: 2,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    jitterFactor: 0.15
  },
  CACHE_REFRESH: {
    maxRetries: 2,
    baseDelayMs: 300,
    maxDelayMs: 30000,
    jitterFactor: 0.15
  }
};

// ============================================================================
// Error Classification Types
// ============================================================================

/**
 * Classification of errors for retry decisions
 */
export enum ErrorCategory {
  TRANSIENT = 'transient',     // Temporary failures, should retry
  PERMANENT = 'permanent',     // Permanent failures, move to DLQ immediately
  UNKNOWN = 'unknown'          // Unclassified, default to retry
}

/**
 * Error classification rules: map HTTP status codes and error patterns
 */
export const ERROR_CLASSIFICATION_RULES: {
  statusCodes: number[];
  patterns: RegExp[];
  category: ErrorCategory;
}[] = [
  // Transient errors
  {
    statusCodes: [408, 429, 500, 502, 503, 504],
    patterns: [],
    category: ErrorCategory.TRANSIENT
  },
  {
    patterns: [
      /timeout/i,
      /deadlock/i,
      /connection\s+refused/i,
      /network\s+error/i,
      /redis\s+connection/i,
      /temporarily\s+unavailable/i,
      /service\s+unavailable/i,
      /try\s+again/i
    ],
    statusCodes: [],
    category: ErrorCategory.TRANSIENT
  },
  // Permanent errors
  {
    statusCodes: [400, 401, 403, 404, 422],
    patterns: [],
    category: ErrorCategory.PERMANENT
  },
  {
    patterns: [
      /validation\s+error/i,
      /invalid\s+payload/i,
      /malformed/i,
      /unauthorized/i,
      /forbidden/i,
      /not\s+found/i,
      /quota\s+exceeded/i,
      /rate\s+limit/i,
      /syntax\s+error/i
    ],
    statusCodes: [],
    category: ErrorCategory.PERMANENT
  }
];

/**
 * Classify an error as transient or permanent
 */
export function classifyError(error: unknown): ErrorCategory {
  if (!error) return ErrorCategory.UNKNOWN;

  const err = error as Error;
  const message = err.message?.toLowerCase() || '';
  const name = err.name?.toLowerCase() || '';

  // Check status codes (if available)
  const statusCode = (err as any).statusCode || (err as any).code;
  if (statusCode && typeof statusCode === 'number') {
    for (const rule of ERROR_CLASSIFICATION_RULES) {
      if (rule.statusCodes.includes(statusCode)) {
        return rule.category;
      }
    }
  }

  // Check message patterns
  for (const rule of ERROR_CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(message) || pattern.test(name)) {
        return rule.category;
      }
    }
  }

  // Database-specific checks
  const anyErr = err as any;
  if (anyErr.code === 'P2002') { // Prisma unique constraint
    // Duplicate key could be either transient (race condition) or permanent (true duplicate)
    // For message upsert, duplicates are handled specially, so treat as permanent
    return ErrorCategory.PERMANENT;
  }

  // Default: treat as transient to be safe
  return ErrorCategory.TRANSIENT;
}

// ============================================================================
// DLQ (Dead Letter Queue) Types
// ============================================================================

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

// ============================================================================
// Retry Calculation Types
// ============================================================================

/**
 * Result of retry delay calculation
 */
export interface RetryDelayResult {
  /** Delay in milliseconds */
  delayMs: number;
  /** Actual jitter applied (0-1) */
  jitter: number;
  /** Attempt number (1-indexed) */
  attempt: number;
  /** Max attempts for this job type */
  maxAttempts: number;
}

// ============================================================================
// Feature Flag Types
// ============================================================================

export const FEATURE_FLAG_RETRY_DLQ = 'ENABLE_RETRY_DLQ';

/**
 * Check if retry/DLQ system is enabled
 */
export function isRetryDlqEnabled(): boolean {
  return process.env[FEATURE_FLAG_RETRY_DLQ] === 'true';
}
