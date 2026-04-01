/**
 * Rate Limiting API - Metrics Controllers
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getRateLimiter } from '../../../lib/rate-limiting-with-redis';

/**
 * GET /metrics - Get rate limit metrics
 */
export async function getMetrics(request: FastifyRequest, reply: FastifyReply) {
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

/**
 * POST /metrics/reset - Reset metrics counters
 */
export async function resetMetrics(request: FastifyRequest, reply: FastifyReply) {
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
