/**
 * Message Queue Priority System - Operations
 * Main API for adding jobs to the priority queue
 */

import { messageQueue } from './queue.instance';
import { MessagePriority, MessageType, getPriorityForType } from './enums';
import { getRetryLimitForType, getRetryBaseDelayForType } from './retry-helpers';
import { ENABLE_RETRY_DLQ } from './config';
import {
  queueJobsTotal,
} from '../create-comprehensive-metrics-dashboard-(grafana)/index';

/**
 * Add a job to the priority queue
 */
export async function addJob(
  type: MessageType,
  payload: Record<string, unknown>,
  options: {
    priority?: MessagePriority;
    deduplication?: {
      /** Custom deduplication ID (if not provided, will be auto-generated from payload) */
      id?: string;
      /** Deduplication TTL in ms (overrides default) */
      ttl?: number;
      /** Enable/disable deduplication explicitly */
      enabled?: boolean;
      /** Extend TTL on duplicate */
      extend?: boolean;
      /** Replace pending job data on duplicate */
      replace?: boolean;
      /** Required delay for debounce mode */
      delay?: number;
    };
    /** Override retry attempts for this specific job */
    retries?: number;
    /** Override retry delay for this specific job */
    backoffDelay?: number;
  } = {}
): Promise<any> {
  const priority = options.priority ?? getPriorityForType(type);

  // Record metric: job added
  const priorityLabel = Object.keys(MessagePriority).find(key => MessagePriority[key as keyof typeof MessagePriority] === priority) || 'MEDIUM';
  queueJobsTotal.inc({ message_type: type, priority: priorityLabel.toLowerCase() });

  // Build BullMQ job options
  const bullmqOptions: any = { priority };

  // Apply retry configuration if enabled
  if (ENABLE_RETRY_DLQ) {
    // Use provided overrides, or get from default retry policies based on message type
    const retries = options.retries ?? await getRetryLimitForType(type);
    const backoffDelay = options.backoffDelay ?? await getRetryBaseDelayForType(type);

    bullmqOptions.attempts = retries;
    bullmqOptions.backoff = {
      type: 'exponential',
      delay: backoffDelay
    };
  }

  // Integrate deduplication if requested
  if (options.deduplication) {
    const dedupConfig = options.deduplication;

    // If ID not provided, generate from payload (requires the deduplication lib)
    let deduplicationId = dedupConfig.id;
    if (!deduplicationId) {
      // Dynamic import to avoid circular dependency with deduplication system
      try {
        const dedupLib = await import('../implement-message-deduplication-system');
        deduplicationId = dedupLib.generateDeduplicationId(type, payload);
      } catch (e) {
        // If deduplication lib not available, skip deduplication
        console.warn('[MessageQueue] Deduplication library not available:', (e as Error).message);
      }
    }

    if (deduplicationId) {
      bullmqOptions.deduplication = {
        id: deduplicationId,
        ttl: dedupConfig.ttl ?? 60 * 60 * 1000 // Default 1 hour
      };
      if (dedupConfig.extend) bullmqOptions.extend = true;
      if (dedupConfig.replace) bullmqOptions.replace = true;
      if (dedupConfig.delay) bullmqOptions.delay = dedupConfig.delay;
    }
  }

  const jobData = {
    type,
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    source: payload.source ?? 'evolution-webhook'
  };
  return await messageQueue.add(type, jobData, bullmqOptions);
}

/**
 * Add a critical priority job
 */
export async function addCriticalJob(
  type: MessageType,
  payload: Record<string, unknown>
): Promise<any> {
  return await addJob(type, payload, { priority: MessagePriority.CRITICAL });
}

/**
 * Add a background priority job
 */
export async function addBackgroundJob(
  type: MessageType,
  payload: Record<string, unknown>
): Promise<any> {
  return await addJob(type, payload, { priority: MessagePriority.BACKGROUND });
}
