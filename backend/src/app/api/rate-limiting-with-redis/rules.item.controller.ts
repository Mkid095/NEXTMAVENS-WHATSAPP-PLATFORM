/**
 * Rate Limiting API - Rule Item Controllers (Get, Update, Delete)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getRateLimiter } from '../../../lib/rate-limiting-with-redis';
import type { RateLimitRule } from '../../../lib/rate-limiting-with-redis/types';
import { updateRuleSchema } from './schemas';

/**
 * GET /rules/:id - Get specific rule
 */
export async function getRule(request: FastifyRequest, reply: FastifyReply) {
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

/**
 * PUT /rules/:id - Update rule
 */
export async function updateRule(request: FastifyRequest, reply: FastifyReply) {
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

/**
 * DELETE /rules/:id - Delete rule
 */
export async function deleteRule(request: FastifyRequest, reply: FastifyReply) {
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
