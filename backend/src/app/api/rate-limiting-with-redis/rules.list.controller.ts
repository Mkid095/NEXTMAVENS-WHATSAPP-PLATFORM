/**
 * Rate Limiting API - Rules List & Create Controllers
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getRateLimiter } from '../../../lib/rate-limiting-with-redis';
import type { RateLimitRule } from '../../../lib/rate-limiting-with-redis/types';
import { createRuleSchema } from './schemas';

/**
 * GET /rules - List all rate limit rules
 */
export async function listRules(request: FastifyRequest, reply: FastifyReply) {
  const limiter = getRateLimiter();
  if (!limiter) {
    reply.code(503);
    return { error: 'Rate limiter not initialized' };
  }

  return {
    defaultRule: limiter.config.defaultRule,
    rules: limiter.config.rules,
    totalRules: limiter.config.rules.length,
    enabled: limiter.config.enabled
  };
}

/**
 * POST /rules - Create new rate limit rule
 */
export async function createRule(request: FastifyRequest, reply: FastifyReply) {
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
