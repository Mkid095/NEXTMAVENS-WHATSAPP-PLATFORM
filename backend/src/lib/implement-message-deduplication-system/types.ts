/**
 * Message Deduplication System
 * Prevents duplicate WhatsApp messages from being sent
 */

import { MessageType } from '../message-queue-priority-system/types';

/**
 * Deduplication strategy for different message types
 */
export enum DeduplicationStrategy {
  /**
   * Simple: block duplicates until job completes or fails
   */
  SIMPLE = 'simple',
  /**
   * Throttle: block duplicates within a time window (TTL)
   */
  THROTTLE = 'throttle',
  /**
   * Debounce: replace pending jobs with latest data (requires delay)
   */
  DEBOUNCE = 'debounce'
}

/**
 * Configuration for deduplication per message type
 */
export interface DeduplicationConfig {
  /** Whether deduplication is enabled for this message type */
  enabled: boolean;
  /** Deduplication strategy to use */
  strategy: DeduplicationStrategy;
  /** Time-to-live for deduplication lock in milliseconds */
  ttl: number;
  /** Whether to extend TTL on duplicate (for throttle/debounce) */
  extend?: boolean;
  /** Whether to replace job data (for debounce) */
  replace?: boolean;
  /** Required delay for debounce mode (milliseconds) */
  delay?: number;
}

/**
 * Default deduplication configurations per message type
 * Can be updated at runtime via API
 */
export let DEFAULT_DEDUPLICATION_CONFIG: Record<MessageType, DeduplicationConfig> = {
  [MessageType.MESSAGE_UPSERT]: {
    enabled: true,
    strategy: DeduplicationStrategy.THROTTLE,
    ttl: 60 * 60 * 1000, // 1 hour
    extend: true
  },
  [MessageType.MESSAGE_STATUS_UPDATE]: {
    enabled: false, // Status updates are idempotent by nature
    strategy: DeduplicationStrategy.SIMPLE,
    ttl: 5 * 60 * 1000 // 5 minutes
  },
  [MessageType.MESSAGE_DELETE]: {
    enabled: false, // Delete operations are idempotent
    strategy: DeduplicationStrategy.SIMPLE,
    ttl: 5 * 60 * 1000 // 5 minutes
  },
  [MessageType.INSTANCE_STATUS_UPDATE]: {
    enabled: false, // Instance status updates can be frequent
    strategy: DeduplicationStrategy.THROTTLE,
    ttl: 2 * 60 * 1000 // 2 minutes
  },
  [MessageType.CONTACT_UPDATE]: {
    enabled: true, // Contact updates can be frequent but usually idempotent
    strategy: DeduplicationStrategy.THROTTLE,
    ttl: 30 * 60 * 1000 // 30 minutes
  },
  [MessageType.ANALYTICS_EVENT]: {
    enabled: false, // Analytics should always be recorded
    strategy: DeduplicationStrategy.SIMPLE,
    ttl: 60 * 1000 // 1 minute
  },
  [MessageType.WEBHOOK_EVENT]: {
    enabled: false, // Webhooks should be processed
    strategy: DeduplicationStrategy.SIMPLE,
    ttl: 60 * 1000 // 1 minute
  },
  [MessageType.DATABASE_CLEANUP]: {
    enabled: false, // Cleanup tasks are scheduled
    strategy: DeduplicationStrategy.SIMPLE,
    ttl: 60 * 60 * 1000 // 1 hour
  },
  [MessageType.CACHE_REFRESH]: {
    enabled: false, // Cache refresh should always happen
    strategy: DeduplicationStrategy.SIMPLE,
    ttl: 5 * 60 * 1000 // 5 minutes
  },
  [MessageType.WORKFLOW_STEP]: {
    enabled: false, // Workflow steps have their own deduplication
    strategy: DeduplicationStrategy.SIMPLE,
    ttl: 60 * 1000 // 1 minute
  }
};

/**
 * Options when adding a job with deduplication
 */
export interface AddJobWithDeduplicationOptions {
  /** Optional custom deduplication config (overrides defaults) */
  deduplicationConfig?: Partial<DeduplicationConfig>;
  /** Whether to force deduplication even if disabled globally */
  forceDeduplication?: boolean;
  /** Priority override (passed to BullMQ) */
  priority?: number;
}

/**
 * Result of a deduplication check
 */
export interface DeduplicationResult {
  /** Whether the message is a duplicate */
  isDuplicate: boolean;
  /** Job ID if not a duplicate (or existing job ID) */
  jobId?: string;
  /** Reason if duplicate */
  reason?: 'existing_job' | 'deduplication_enabled' | 'deduplication_disabled' | 'check_requires_queue_query';
  /** Deduplication ID used */
  deduplicationId?: string;
}

/**
 * Metrics for monitoring deduplication effectiveness
 */
export interface DeduplicationMetrics {
  /** Total jobs processed */
  totalJobs: number;
  /** Jobs deduplicated (rejected as duplicates) */
  deduplicatedJobs: number;
  /** Unique jobs added */
  uniqueJobsAdded: number;
  /** Current deduplication cache size (if using in-memory) */
  cacheSize: number;
  /** Breakdown by message type */
  byMessageType: Record<MessageType, {
    total: number;
    deduplicated: number;
  }>;
}

/**
 * Internal deduplication cache entry
 */
interface DeduplicationEntry {
  /** Job ID that was added */
  jobId: string;
  /** Timestamp when entry was created */
  createdAt: Date;
  /** Message type for metrics */
  messageType: MessageType;
}
