/**
 * Message Deduplication System
 * Prevents duplicate WhatsApp messages from entering the queue
 *
 * Integrates with BullMQ's built-in deduplication feature
 */

import { createHash } from 'crypto';

import { MessageType } from '../message-queue-priority-system/types';
import {
  DeduplicationConfig,
  DeduplicationResult,
  DeduplicationMetrics,
  DEFAULT_DEDUPLICATION_CONFIG,
  AddJobWithDeduplicationOptions,
  DeduplicationStrategy
} from './types';

// Re-export for mutability (in production, use a proper config store)
export { DEFAULT_DEDUPLICATION_CONFIG, DeduplicationStrategy };

// Circular import - we'll use a getter pattern instead
let messageQueue: any = null;

function getQueue() {
  if (!messageQueue) {
    // Dynamic import to avoid circular dependency
    const q = require('../message-queue-priority-system/index');
    messageQueue = q.messageQueue;
  }
  return messageQueue;
}

/**
 * Generate a deterministic deduplication ID from message data
 * Based on: message content + recipient + sender + type
 *
 * Creates a SHA-256 hash of the relevant fields to ensure
 * identical messages within the same conversation have the same ID.
 */
export function generateDeduplicationId(
  messageType: MessageType,
  payload: Record<string, unknown>
): string {
  const dataToHash: Record<string, unknown> = {
    type: messageType,
  };

  switch (messageType) {
    case MessageType.MESSAGE_UPSERT:
      // For outgoing messages: hash content + recipient (to) + sender instance
      // For incoming messages: hash messageId (WhatsApp's unique ID)
      if (payload.messageId && typeof payload.messageId === 'string' && payload.messageId.startsWith('http')) {
        // This is likely a webhook event from Evolution - use WhatsApp's messageId
        dataToHash.whatsappMessageId = payload.messageId;
      } else {
        // Custom message - hash content and recipients
        dataToHash.content = payload.content ?? payload.text ?? '';
        dataToHash.to = payload.to ?? '';
        dataToHash.from = payload.from ?? '';
      }
      // Include org and instance to scope deduplication per tenant
      dataToHash.orgId = payload.orgId ?? '';
      dataToHash.instanceId = payload.instanceId ?? '';
      break;

    case MessageType.MESSAGE_STATUS_UPDATE:
      // Status updates are naturally idempotent - same messageId + same status
      dataToHash.messageId = payload.messageId;
      dataToHash.status = payload.status;
      break;

    case MessageType.MESSAGE_DELETE:
      // Delete is idempotent
      dataToHash.messageId = payload.messageId;
      break;

    case MessageType.INSTANCE_STATUS_UPDATE:
      dataToHash.instanceId = payload.instanceId;
      dataToHash.status = payload.status;
      break;
  }

  // Sort keys and create deterministic JSON string
  const sortedKeys = Object.keys(dataToHash).sort();
  const deterministicData: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    deterministicData[key] = dataToHash[key];
  }

  const json = JSON.stringify(deterministicData);
  return createHash('sha256').update(json).digest('hex').substring(0, 32);
}

/**
 * Get the deduplication configuration for a message type
 */
export function getDeduplicationConfig(
  messageType: MessageType,
  customConfig?: Partial<DeduplicationConfig>
): DeduplicationConfig {
  const baseConfig = DEFAULT_DEDUPLICATION_CONFIG[messageType];

  if (!customConfig) {
    return { ...baseConfig };
  }

  // Merge custom config with defaults
  return {
    ...baseConfig,
    ...customConfig,
    // If strategy is changed, we might need to adjust TTL
    ttl: customConfig.ttl ?? baseConfig.ttl,
    extend: customConfig.extend ?? baseConfig.extend ?? false,
    replace: customConfig.replace ?? baseConfig.replace ?? false,
    delay: customConfig.delay ?? baseConfig.delay
  };
}

/**
 * Build BullMQ deduplication options from config
 */
export function buildDeduplicationOptions(
  config: DeduplicationConfig
): { deduplication: { id: string; ttl: number }; extend?: boolean; replace?: boolean } | undefined {
  if (!config.enabled) {
    return undefined;
  }

  const options: any = {
    deduplication: {
      ttl: config.ttl
      // Note: 'id' will be set dynamically when adding job
    }
  };

  if (config.extend) options.extend = true;
  if (config.replace) options.replace = true;

  // Debounce mode requires delay
  if (config.strategy === DeduplicationStrategy.DEBOUNCE && config.delay) {
    options.delay = config.delay;
  }

  return options;
}

// In-memory metrics tracking (optional, can be enhanced with Redis)
const initialByType: Record<MessageType, { total: number; deduplicated: number }> = {} as any;
for (const type of Object.values(MessageType)) {
  initialByType[type] = { total: 0, deduplicated: 0 };
}

let metrics: DeduplicationMetrics = {
  totalJobs: 0,
  deduplicatedJobs: 0,
  uniqueJobsAdded: 0,
  cacheSize: 0,
  byMessageType: initialByType
};

/**
 * Record metrics for a deduplication attempt
 */
export function recordDeduplicationAttempt(
  messageType: MessageType,
  result: DeduplicationResult
): void {
  metrics.totalJobs++;
  metrics.byMessageType[messageType].total++;

  if (result.isDuplicate) {
    metrics.deduplicatedJobs++;
    metrics.byMessageType[messageType].deduplicated++;
  } else {
    metrics.uniqueJobsAdded++;
  }
}

/**
 * Get current deduplication metrics
 */
export function getDeduplicationMetrics(): DeduplicationMetrics {
  const byTypeCopy: Record<MessageType, { total: number; deduplicated: number }> = {} as any;
  for (const type of Object.values(MessageType)) {
    const data = metrics.byMessageType[type];
    byTypeCopy[type] = { total: data.total, deduplicated: data.deduplicated };
  }

  return {
    totalJobs: metrics.totalJobs,
    deduplicatedJobs: metrics.deduplicatedJobs,
    uniqueJobsAdded: metrics.uniqueJobsAdded,
    cacheSize: metrics.cacheSize,
    byMessageType: byTypeCopy
  };
}

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics(): void {
  const initialByType: Record<MessageType, { total: number; deduplicated: number }> = {} as any;
  for (const type of Object.values(MessageType)) {
    initialByType[type] = { total: 0, deduplicated: 0 };
  }

  metrics = {
    totalJobs: 0,
    deduplicatedJobs: 0,
    uniqueJobsAdded: 0,
    cacheSize: 0,
    byMessageType: initialByType
  };
}

/**
 * Check if a message would be deduplicated without actually adding it
 * Useful for preview/validation endpoints
 */
export function checkPotentialDuplicate(
  messageType: MessageType,
  payload: Record<string, unknown>,
  config?: Partial<DeduplicationConfig>
): DeduplicationResult {
  const fullConfig = getDeduplicationConfig(messageType, config);

  if (!fullConfig.enabled) {
    return { isDuplicate: false, reason: 'deduplication_disabled' as const };
  }

  const deduplicationId = generateDeduplicationId(messageType, payload);

  // Note: We cannot actually check Redis without adding a job
  // This is a heuristic check based on configuration
  return {
    isDuplicate: false, // Cannot determine without querying BullMQ's internal locks
    deduplicationId,
    reason: 'check_requires_queue_query' as const
  };
}

/**
 * Utility to convert message payload to a deduplication ID
 * This is the main function used by the queue producer
 */
export function createDeduplicationOptions(
  messageType: MessageType,
  payload: Record<string, unknown>,
  options?: AddJobWithDeduplicationOptions
): { deduplicationId: string; bullmqOptions: any } | null {
  const config = getDeduplicationConfig(messageType, options?.deduplicationConfig);

  if (!config.enabled && !options?.forceDeduplication) {
    return null;
  }

  const deduplicationId = generateDeduplicationId(messageType, payload);

  // Build BullMQ options
  const bullmqOptions: any = {
    priority: options?.priority
  };

  // Add deduplication options
  bullmqOptions.deduplication = {
    id: deduplicationId,
    ttl: config.ttl
  };

  if (config.extend) bullmqOptions.extend = true;
  if (config.replace) bullmqOptions.replace = true;
  if (config.delay) bullmqOptions.delay = config.delay;

  return { deduplicationId, bullmqOptions };
}
