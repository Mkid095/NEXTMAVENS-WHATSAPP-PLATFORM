/**
 * Rate Limiting System API Routes
 * Admin endpoints for managing rate limit rules and viewing metrics
 *
 * Base path: /admin/rate-limiting
 * Endpoints:
 * - GET    /rules                    - List all rate limit rules
 * - POST   /rules                    - Create new rule
 * - GET    /rules/:id                - Get rule by ID
 * - PUT    /rules/:id                - Update rule
 * - DELETE /rules/:id                - Delete rule
 * - GET    /metrics                  - Get rate limit metrics
 * - POST   /metrics/reset            - Reset metrics
 * - GET    /status                   - Get current status for identifier
 * - POST   /reset                    - Reset rate limit for identifier
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getRateLimiter, initializeRateLimiter } from '../../../lib/rate-limiting-with-redis';
import type { RateLimitRule } from '../../../lib/rate-limiting-with-redis/types';

// ============================================================================
// Zod Schemas
// ============================================================================

const createRuleSchema = z.object({
  ruleId: z.string().min(1),
  orgId: z.string().uuid().optional().nullable(),
  instanceId: z.string().optional().nullable(),
  endpoint: z.string().min(1),
  maxRequests: z.number().int().positive(),
  windowMs: z.number().int().positive(),
  trackMetrics: z.boolean().optional().default(true)
});

const updateRuleSchema = z.object({
  orgId: z.string().uuid().optional().nullable(),
  instanceId: z.string().optional().nullable(),
  endpoint: z.string().min(1),
  maxRequests: z.number().int().positive().optional(),
  windowMs: z.number().int().positive().optional(),
  trackMetrics: z.boolean().optional()
});

const statusQuerySchema = z.object({
  identifier: z.string().min(1),
  ruleId: z.string().optional()
});

const resetSchema = z.object({
  identifier: z.string().min(1),
  ruleId: z.string().optional()
});

// ============================================================================
// Plugin Registration
// ============================================================================

export default async function (fastify: FastifyInstance) {
  // Ensure rate limiter is initialized
  await initializeRateLimiter();

  // ------------------------------------------------------------------------
  // GET /rules - List all rate limit rules
  // ------------------------------------------------------------------------
  fastify.get(
    '/rules',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const limiter = getRateLimiter();
      if (!limiter) {
        reply.code(503);
        return { error: 'Rate limiter not initialized' };
      }

      // Return both default rule and custom rules
      return {
        defaultRule: limiter.config.defaultRule,
        rules: limiter.config.rules,
        totalRules: limiter.config.rules.length,
        enabled: limiter.config.enabled
      };
    }
  );

  // ------------------------------------------------------------------------
  // POST /rules - Create new rate limit rule
  // ------------------------------------------------------------------------
  fastify.post(
    '/rules',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = createRuleSchema.parse(request.body);
        const limiter = getRateLimiter();
        if (!limiter) {
          reply.code(503);
          return { error: 'Rate limiter not initialized' };
        }

        const { ruleId, ...ruleData } = body;

        // Check if rule ID already exists
        const exists = limiter.config.rules.some(r => r.id === ruleId);
        if (exists) {
          reply.code(409);
          return { error: `Rule with id '${ruleId}' already exists` };
        }

        const newRule: RateLimitRule = {
          id: ruleId,
          ...ruleData
        };

        limiter.config.rules.push(newRule);

        reply.code(201);
        return {
          success: true,
          message: 'Rate limit rule created',
          rule: newRule
        };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /rules/:id - Get specific rule
  // ------------------------------------------------------------------------
  fastify.get(
    '/rules/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = z.object({ id: z.string() }).parse(request.params);
        const { id } = params;
        const limiter = getRateLimiter();
        if (!limiter) {
          reply.code(503);
          return { error: 'Rate limiter not initialized' };
        }

        // Check default rule first
        if (id === limiter.config.defaultRule.id) {
          return { rule: limiter.config.defaultRule };
        }

        // Search custom rules
        const rule = limiter.config.rules.find(r => r.id === id);
        if (!rule) {
          reply.code(404);
          return { error: `Rule '${id}' not found` };
        }

        return { rule };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // PUT /rules/:id - Update rule
  // ------------------------------------------------------------------------
  fastify.put(
    '/rules/:id',
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      try {
        const params = z.object({ id: z.string() }).parse(request.params);
        const updates = updateRuleSchema.parse(request.body);
        const { id } = params;
        const limiter = getRateLimiter();
        if (!limiter) {
          reply.code(503);
          return { error: 'Rate limiter not initialized' };
        }

        // Find rule
        const ruleIndex = limiter.config.rules.findIndex(r => r.id === id);
        if (ruleIndex === -1) {
          reply.code(404);
          return { error: `Rule '${id}' not found` };
        }

        // Update rule fields
        const rule = limiter.config.rules[ruleIndex];
        if (updates.maxRequests !== undefined) rule.maxRequests = updates.maxRequests;
        if (updates.windowMs !== undefined) rule.windowMs = updates.windowMs;
        if (updates.orgId !== undefined) rule.orgId = updates.orgId;
        if (updates.instanceId !== undefined) rule.instanceId = updates.instanceId;
        if (updates.endpoint !== undefined) rule.endpoint = updates.endpoint;
        if (updates.trackMetrics !== undefined) rule.trackMetrics = updates.trackMetrics;

        return {
          success: true,
          message: 'Rate limit rule updated',
          rule
        };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // DELETE /rules/:id - Delete rule
  // ------------------------------------------------------------------------
  fastify.delete(
    '/rules/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = z.object({ id: z.string() }).parse(request.params);
        const { id } = params;
        const limiter = getRateLimiter();
        if (!limiter) {
          reply.code(503);
          return { error: 'Rate limiter not initialized' };
        }

        // Cannot delete default rule
        if (id === limiter.config.defaultRule.id) {
          reply.code(400);
          return { error: 'Cannot delete default rule' };
        }

        const initialLength = limiter.config.rules.length;
        limiter.config.rules = limiter.config.rules.filter(r => r.id !== id);

        if (limiter.config.rules.length === initialLength) {
          reply.code(404);
          return { error: `Rule '${id}' not found` };
        }

        return {
          success: true,
          message: `Rule '${id}' deleted`
        };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /metrics - Get rate limit metrics
  // ------------------------------------------------------------------------
  fastify.get(
    '/metrics',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const limiter = getRateLimiter();
      if (!limiter) {
        reply.code(503);
        return { error: 'Rate limiter not initialized' };
      }

      const metrics = limiter.getMetrics();

      // Calculate derived metrics
      const total = metrics.totalRequests;
      const allowed = metrics.allowedRequests;
      const blocked = metrics.blockedRequests;
      const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(2) + '%' : '0%';

      return {
        metrics: {
          ...metrics,
          totalRequests: total,
          allowedRequests: allowed,
          blockedRequests: blocked,
          blockRate,
          lastCleanup: metrics.lastCleanup.toISOString()
        }
      };
    }
  );

  // ------------------------------------------------------------------------
  // POST /metrics/reset - Reset metrics counters
  // ------------------------------------------------------------------------
  fastify.post(
    '/metrics/reset',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const limiter = getRateLimiter();
      if (!limiter) {
        reply.code(503);
        return { error: 'Rate limiter not initialized' };
      }

      limiter.resetMetrics();

      return {
        success: true,
        message: 'Metrics reset'
      };
    }
  );

  // ------------------------------------------------------------------------
  // GET /status - Get current status for identifier
  // ------------------------------------------------------------------------
  fastify.get(
    '/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = statusQuerySchema.parse(request.query);
        const limiter = getRateLimiter();
        if (!limiter) {
          reply.code(503);
          return { error: 'Rate limiter not initialized' };
        }

        const { identifier, ruleId } = query;

        // Determine which rule to use
        let rule: RateLimitRule;
        if (ruleId) {
          const found = limiter.config.rules.find(r => r.id === ruleId) || limiter.config.defaultRule;
          if (found.id !== ruleId) {
            reply.code(404);
            return { error: `Rule '${ruleId}' not found` };
          }
          rule = found;
        } else {
          // Use default rule if none specified
          rule = limiter.config.defaultRule;
        }

        const status = await limiter.getStatus(identifier, rule);

        return {
          identifier,
          rule: { id: rule.id, maxRequests: rule.maxRequests, windowMs: rule.windowMs },
          ...status
        };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // POST /reset - Reset rate limit for identifier
  // ------------------------------------------------------------------------
  fastify.post(
    '/reset',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = resetSchema.parse(request.body);
        const limiter = getRateLimiter();
        if (!limiter) {
          reply.code(503);
          return { error: 'Rate limiter not initialized' };
        }

        const { identifier, ruleId } = body;

        // Determine which rule
        const rule = ruleId
          ? (limiter.config.rules.find(r => r.id === ruleId) || limiter.config.defaultRule)
          : limiter.config.defaultRule;

        const success = await limiter.reset(identifier, rule);

        return {
          success,
          message: success ? 'Rate limit reset' : 'No rate limit found for identifier',
          identifier,
          ruleId: rule.id
        };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: 'Validation error', details: error.format() });
          return;
        }
        throw error;
      }
    }
  );

  // ------------------------------------------------------------------------
  // GET /health - Health check
  // ------------------------------------------------------------------------
  fastify.get('/health', async (request, reply) => {
    const limiter = getRateLimiter();
    if (!limiter) {
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        error: 'Rate limiter not initialized'
      };
    }

    const metrics = limiter.getMetrics();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      enabled: limiter.config.enabled,
      rulesCount: limiter.config.rules.length,
      totalRequests: metrics.totalRequests,
      uptime: process.uptime()
    };
  });
}
