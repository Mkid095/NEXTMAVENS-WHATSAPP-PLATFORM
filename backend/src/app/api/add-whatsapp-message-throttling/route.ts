/**
 * WhatsApp Message Throttling Admin API
 *
 * Endpoints for managing throttle configurations and viewing status.
 * Protected by auth + orgGuard middleware (SUPER_ADMIN only).
 *
 * Base path: /admin/throttle
 *
 * Endpoints:
 * - GET    /admin/throttle/configs            - List all throttle configs
 * - GET    /admin/throttle/config/:org/:inst? - Get specific config
 * - POST   /admin/throttle/config             - Create/update config
 * - DELETE /admin/throttle/config/:org/:inst  - Delete config
 * - GET    /admin/throttle/status             - Get current usage status
 * - POST   /admin/throttle/reset              - Reset counters for org/instance
 */

import { z, ZodError } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  whatsAppMessageThrottle,
  ThrottleConfig,
  ThrottleResult,
} from '../../../lib/add-whatsapp-message-throttling';

// ============================================================================
// Schemas
// ============================================================================

const throttleConfigSchema = z.object({
  orgId: z.string().optional().nullable(),
  instanceId: z.string().optional().nullable(),
  messagesPerMinute: z.number().int().positive(),
  messagesPerHour: z.number().int().positive().optional().default(0),
});

const throttleResetSchema = z.object({
  orgId: z.string(),
  instanceId: z.string().optional().nullable(),
});

type ThrottleConfigBody = z.infer<typeof throttleConfigSchema>;

// ============================================================================
// Plugin Registration
// ============================================================================

export default async function (fastify: FastifyInstance) {
  // Ensure throttling system is initialized and configs loaded
  await whatsAppMessageThrottle.loadConfigs();

  // ------------------------------------------------------------------------
  // GET /admin/throttle/configs - List all throttle configs
  // ------------------------------------------------------------------------
  fastify.get('/admin/throttle/configs', async (request, reply) => {
    // Return all configs from memory (could also fetch from Redis)
    // For simplicity, we'll return defaults + custom configs
    const configs: ThrottleConfig[] = [];
    // We don't have direct access to internal map, so reconstruct from Redis
    const redis = (require('../../../lib/message-queue-priority-system').redisConnectionOptions);
    const { createClient } = require('redis');
    const client = createClient(redis);
    await client.connect();

    try {
      const raw = await client.hGetAll('throttle:configs');
      for (const [key, value] of Object.entries(raw)) {
        try {
          const config = JSON.parse(value as string) as ThrottleConfig;
          configs.push(config);
        } catch (e) {
          // skip invalid
        }
      }
    } finally {
      await client.quit();
    }

    return { configs, count: configs.length };
  });

  // ------------------------------------------------------------------------
  // GET /admin/throttle/config/:org/:instance? - Get specific config
  // ------------------------------------------------------------------------
  fastify.get(
    '/admin/throttle/config/:orgId/:instanceId?',
    async (request: FastifyRequest<{ Params: { orgId: string; instanceId?: string } }>, reply) => {
      const { orgId, instanceId } = request.params;
      const status = await whatsAppMessageThrottle.getStatus(orgId, instanceId ?? 'all');

      // We need to return the actual config as well. We'll fetch from internal store via Redis.
      const key = `${orgId}:${instanceId ?? 'all'}`;
      const redis = (require('../../../lib/message-queue-priority-system').redisConnectionOptions);
      const { createClient } = require('redis');
      const client = createClient(redis);
      await client.connect();

      try {
        const raw = await client.hGet('throttle:configs', key);
        const config = raw ? JSON.parse(raw as string) : null;

        return {
          orgId,
          instanceId: instanceId ?? 'all',
          config,
          status,
        };
      } finally {
        await client.quit();
      }
    }
  );

  // ------------------------------------------------------------------------
  // POST /admin/throttle/config - Create or update throttle config
  // ------------------------------------------------------------------------
  fastify.post(
    '/admin/throttle/config',
    {
      schema: { body: throttleConfigSchema },
    },
    async (request: FastifyRequest<{ Body: ThrottleConfigBody }>, reply) => {
      const body = request.body;

      // Validate
      try {
        throttleConfigSchema.parse(body);
      } catch (err) {
        if (err instanceof ZodError) {
          reply.code(400);
          return { error: 'Validation failed', details: err.issues };
        }
      }

      const config: ThrottleConfig = {
        orgId: body.orgId ?? null,
        instanceId: body.instanceId ?? null,
        messagesPerMinute: body.messagesPerMinute,
        messagesPerHour: body.messagesPerHour ?? 0,
      };

      try {
        await whatsAppMessageThrottle.setConfig(config);
        return {
          success: true,
          message: 'Throttle config saved',
          config,
        };
      } catch (error: any) {
        reply.code(500);
        return { error: error.message };
      }
    }
  );

  // ------------------------------------------------------------------------
  // DELETE /admin/throttle/config/:orgId/:instanceId? - Remove custom config
  // ------------------------------------------------------------------------
  fastify.delete(
    '/admin/throttle/config/:orgId/:instanceId?',
    async (request: FastifyRequest<{ Params: { orgId: string; instanceId?: string } }>, reply) => {
      const { orgId, instanceId } = request.params;
      const key = `${orgId}:${instanceId ?? 'all'}`;

      const redis = (require('../../../lib/message-queue-priority-system').redisConnectionOptions);
      const { createClient } = require('redis');
      const client = createClient(redis);
      await client.connect();

      try {
        const deleted = await client.hDel('throttle:configs', key);
        if (deleted === 0) {
          return { success: false, message: 'No custom config found to delete' };
        }
        return { success: true, message: 'Config deleted' };
      } finally {
        await client.quit();
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /admin/throttle/status - Current global throttle status
  // ------------------------------------------------------------------------
  fastify.get('/admin/throttle/status', async (request, reply) => {
    const metrics = whatsAppMessageThrottle.getMetrics();

    // Could also aggregate from Redis for all orgs/instances but expensive
    return {
      metrics,
      timestamp: new Date().toISOString(),
    };
  });

  // ------------------------------------------------------------------------
  // POST /admin/throttle/reset - Reset counters for specific org/instance
  // ------------------------------------------------------------------------
  fastify.post(
    '/admin/throttle/reset',
    {
      schema: { body: throttleResetSchema },
    },
    async (request: FastifyRequest<{ Body: { orgId: string; instanceId?: string } }>, reply) => {
      const { orgId, instanceId } = request.body;

      try {
        const result = await whatsAppMessageThrottle.reset(orgId, instanceId ?? 'all');
        if (!result) {
          return { success: false, message: 'No throttle counters found to reset' };
        }
        return { success: true, message: 'Throttle counters reset' };
      } catch (error: any) {
        reply.code(500);
        return { error: error.message };
      }
    }
  );

  fastify.log.info('WhatsApp Message Throttle admin routes registered under /admin/throttle');
}
