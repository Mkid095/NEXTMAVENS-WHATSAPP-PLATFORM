/**
 * Message Deduplication API Routes
 * Exposes configuration and metrics for the deduplication system.
 *
 * Base path: / (mounted directly)
 * Endpoints:
 * - GET    /config         - Get deduplication configuration
 * - POST   /config         - Update deduplication configuration
 * - GET    /metrics        - Get deduplication metrics
 * - POST   /metrics/reset  - Reset metrics counters
 * - POST   /check          - Check if a message would be deduplicated
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as dedupLib from '../../../lib/implement-message-deduplication-system';
import { MessageType } from '../../../lib/message-queue-priority-system/types';
import { DeduplicationConfig, DeduplicationStrategy } from '../../../lib/implement-message-deduplication-system/types';
import { DEFAULT_DEDUPLICATION_CONFIG } from '../../../lib/implement-message-deduplication-system/types';

// ============================================================================
// Zod Schemas
// ============================================================================

const messageTypeEnum = z.enum(Object.values(MessageType));
const strategyEnum = z.enum(['simple', 'throttle', 'debounce']);

const configUpdateSchema = z.object({
  messageType: messageTypeEnum,
  config: z.object({
    enabled: z.boolean().optional(),
    strategy: strategyEnum.optional(),
    ttl: z.number().int().positive().optional(),
    extend: z.boolean().optional(),
    replace: z.boolean().optional(),
    delay: z.number().int().positive().optional(),
  }),
});

const checkSchema = z.object({
  messageType: messageTypeEnum,
  payload: z.any(), // Accept any payload structure
});

type ConfigUpdateBody = z.infer<typeof configUpdateSchema>;
type CheckBody = z.infer<typeof checkSchema>;

// In-memory mutable config (clone the defaults to avoid mutating the original)
const initialConfig: Record<MessageType, DeduplicationConfig> = {} as any;
for (const type of Object.values(MessageType)) {
  initialConfig[type] = { ...DEFAULT_DEDUPLICATION_CONFIG[type] };
}

let currentConfig: Record<MessageType, DeduplicationConfig> = initialConfig;

// ============================================================================
// Plugin Registration
// ============================================================================

export default async function (fastify: FastifyInstance) {
  // ------------------------------------------------------------------------
  // GET /config - Get current deduplication configuration
  // ------------------------------------------------------------------------
  fastify.get('/config', async (request, reply) => {
    return { config: currentConfig };
  });

  // ------------------------------------------------------------------------
  // POST /config - Update deduplication configuration for a message type
  // ------------------------------------------------------------------------
  fastify.post(
    '/config',
    { schema: { body: configUpdateSchema } },
    async (request: FastifyRequest<{ Body: ConfigUpdateBody }>, reply: FastifyReply) => {
      const { messageType, config: partialConfig } = request.body;

      // Merge with existing config
      const existing = currentConfig[messageType];
      if (!existing) {
        reply.code(404);
        return { error: `Unknown message type: ${messageType}` };
      }

      // Convert strategy string to enum if provided
      const strategyValue = partialConfig.strategy
        ? (partialConfig.strategy as DeduplicationStrategy)
        : undefined;

      currentConfig[messageType] = {
        ...existing,
        ...partialConfig,
        strategy: strategyValue ?? existing.strategy,
        // Ensure these are boolean if provided
        extend: partialConfig.extend ?? existing.extend,
        replace: partialConfig.replace ?? existing.replace,
      };

      // Also update the dedupLib's default for future new instances
      dedupLib.DEFAULT_DEDUPLICATION_CONFIG[messageType] = currentConfig[messageType];

      return {
        success: true,
        messageType,
        config: currentConfig[messageType]
      };
    }
  );

  // ------------------------------------------------------------------------
  // GET /metrics - Get deduplication metrics
  // ------------------------------------------------------------------------
  fastify.get('/metrics', async (request, reply) => {
    const metrics = dedupLib.getDeduplicationMetrics();
    return { metrics };
  });

  // ------------------------------------------------------------------------
  // POST /metrics/reset - Reset metrics counters
  // ------------------------------------------------------------------------
  fastify.post('/metrics/reset', async (request, reply) => {
    dedupLib.resetMetrics();
    return { success: true, message: 'Metrics reset' };
  });

  // ------------------------------------------------------------------------
  // POST /check - Check if a message would be deduplicated
  // ------------------------------------------------------------------------
  fastify.post(
    '/check',
    { schema: { body: checkSchema } },
    async (request: FastifyRequest<{ Body: CheckBody }>, reply: FastifyReply) => {
      const { messageType, payload } = request.body;
      const config = currentConfig[messageType];

      if (!config || !config.enabled) {
        return {
          isDuplicate: false,
          reason: 'deduplication_disabled' as const,
          config
        };
      }

      // Generate deduplication ID
      const deduplicationId = dedupLib.generateDeduplicationId(messageType, payload);

      // Note: We cannot know for sure without querying Redis
      // This returns what *would* happen based on config
      return {
        isDuplicate: false, // Cannot determine without locking check
        deduplicationId,
        config,
        note: 'BullMQ will handle deduplication at job enqueue time based on Redis locks'
      };
    }
  );
}
