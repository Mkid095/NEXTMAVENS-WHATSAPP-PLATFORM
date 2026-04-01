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
 * - GET    /health                   - Health check
 */

import { FastifyInstance } from 'fastify';
import { initializeRateLimiter, getRateLimiter } from '../../../lib/rate-limiting-with-redis';

// Import controllers
import { listRules, createRule } from './rules.list.controller';
import { getRule, updateRule, deleteRule } from './rules.item.controller';
import { getMetrics, resetMetrics } from './metrics.controller';
import { getStatus, resetLimit } from './status.controller';

export default async function (fastify: FastifyInstance) {
  // Ensure rate limiter is initialized
  await initializeRateLimiter();

  // Rules endpoints
  fastify.get('/rules', listRules);
  fastify.post('/rules', createRule);
  fastify.get('/rules/:id', getRule);
  fastify.put('/rules/:id', updateRule);
  fastify.delete('/rules/:id', deleteRule);

  // Metrics endpoints
  fastify.get('/metrics', getMetrics);
  fastify.post('/metrics/reset', resetMetrics);

  // Status & reset endpoints
  fastify.get('/status', getStatus);
  fastify.post('/reset', resetLimit);

  // Health check
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
