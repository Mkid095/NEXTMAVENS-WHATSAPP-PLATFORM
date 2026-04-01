/**
 * Rate Limiting API - Status & Reset Controllers
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getRateLimiter } from '../../../lib/rate-limiting-with-redis';
import type { RateLimitRule } from '../../../lib/rate-limiting-with-redis/types';
import { statusQuerySchema, resetSchema } from './schemas';

/**
 * GET /status - Get current status for identifier
 */
export async function getStatus(request: FastifyRequest, reply: FastifyReply) {
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

/**
 * POST /reset - Reset rate limit for identifier
 */
export async function resetLimit(request: FastifyRequest, reply: FastifyReply) {
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
