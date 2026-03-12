/**
 * Evolution API Message Status Webhook Endpoint
 *
 * Receives webhook POSTs from Evolution API when message statuses change,
 * connections update, etc.
 *
 * Route: POST /api/webhooks/evolution
 *
 * Security:
 * - Signature verification via HMAC-SHA256 (X-Webhook-Signature header)
 * - IP whitelist support (optional)
 * - Multi-tenant RLS enforced after instance lookup
 *
 * Features:
 * - Idempotent processing (upsert pattern)
 * - Async handling with immediate acknowledgment
 * - Comprehensive logging and audit trail
 *
 * @filepath /api/webhooks/evolution
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../../lib/prisma';
import {
  initializeWebhookProcessor,
  processEvolutionWebhook,
  healthCheck,
} from '../../../lib/integrate-evolution-api-message-status-webhooks';
import { routeSchema } from '../../../lib/integrate-evolution-api-message-status-webhooks/validator';

// Initialize on plugin registration
export async function registerEvolutionWebhookRoutes(fastify: FastifyInstance) {
  // Initialize webhook processor once at startup
  try {
    initializeWebhookProcessor({
      webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET!,
    });
    fastify.log.info('Evolution webhook processor initialized');
  } catch (error) {
    fastify.log.error('Failed to initialize webhook processor:', error);
    throw error;
  }

  // Register routes
  fastify.post(
    '/api/webhooks/evolution',
    {
      schema: routeSchema,
      // Request raw body for signature verification
      // Important: This disables body parsing until we need it
      // @ts-ignore - rawBody provided by fastify-raw-body plugin
      rawBody: true,
      // Limit webhook payload size (Evolution payloads are small)
      bodyLimit: 1024 * 100, // 100KB
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      // Extract raw body and parsed JSON
      const rawBody = request.rawBody as Buffer;
      const jsonBody = request.body as any; // validated by schema

      try {
        // Process webhook through main processor
        const result = await processEvolutionWebhook(rawBody, request.headers as any, jsonBody);

        const duration = Date.now() - startTime;
        request.log.info({
          event: jsonBody.event,
          instanceId: jsonBody.instanceId,
          success: result.success,
          duration,
        });

        // Always return 200 to Evolution to prevent unnecessary retries
        // Details in response body can help debugging
        return reply.code(200).send({
          received: true,
          processed: result.success,
          event: result.event,
          messageId: result.messageId,
          error: result.error,
        });
      } catch (error: any) {
        const duration = Date.now() - startTime;
        request.log.error({
          event: jsonBody?.event,
          instanceId: jsonBody?.instanceId,
          error: error.message,
          duration,
        });

        // Signature errors should reject immediately
        if (error.message.includes('signature') || error.message.includes('Invalid')) {
          return reply.code(401).send({
            received: true,
            processed: false,
            error: error.message,
          });
        }

        // For processing errors, still return 200 (idempotency, will be retried via monitoring)
        // Actually, for 5xx Evolution may retry. But we want to avoid duplicate processing.
        // Since our processing is idempotent, we can return 500 to trigger retry.
        // But need to be careful to not pollute DB with partial failures.
        // Let's return 500 for non-signature errors to allow retry.
        return reply.code(500).send({
          received: true,
          processed: false,
          error: error.message,
        });
      }
    }
  );

  // Health check endpoint for monitoring
  fastify.get('/api/webhooks/evolution/health', async (request, reply) => {
    const isHealthy = healthCheck();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      processor: 'evolution-api-message-status-webhooks',
    };
  });

  // Debug endpoint: list recent webhook deliveries (admin-only in production)
  fastify.get(
    '/api/webhooks/evolution/logs',
    {
      // TODO: Add admin auth middleware here
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 50 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              logs: {
                type: 'array',
                items: {
                  type: 'object',
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { limit = 50 } = request.query as { limit?: number };

      const logs = await prisma.webhookDeliveryLog.findMany({
        take: Math.min(limit, 100),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orgId: true,
          eventId: true,
          status: true,
          errorMessage: true,
          attempts: true,
          lastAttemptAt: true,
          createdAt: true,
        },
      });

      return { logs };
    }
  );

  fastify.log.info('Evolution webhook routes registered');
}

// ============================================================================
// Route-specific Types
// ============================================================================

interface EvolutionWebhookRequest extends FastifyRequest {
  rawBody: Buffer;
}

// Plugin registration function
export default function (fastify: FastifyInstance, options: any) {
  return registerEvolutionWebhookRoutes(fastify);
}
