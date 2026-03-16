/**
 * Comprehensive Health Check Endpoint
 *
 * GET /health
 *
 * Returns aggregated health status of database, Redis, BullMQ queue,
 * and system resources (uptime, memory).
 *
 * Response codes:
 * - 200: All systems healthy
 * - 503: One or more systems degraded/unhealthy
 */

import { FastifyInstance } from 'fastify';
import { performHealthCheck } from '../../../lib/create-comprehensive-health-check-endpoint';

export default async function (fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    const result = await performHealthCheck();

    // Set appropriate HTTP status
    if (result.status === 'healthy') {
      reply.code(200);
    } else {
      reply.code(503);
    }

    return result;
  });
}
