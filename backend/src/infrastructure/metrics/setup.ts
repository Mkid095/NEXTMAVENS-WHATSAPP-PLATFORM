/**
 * Metrics System Setup
 * Main entry point for registering all metrics and endpoints
 */

import { register, collectDefaultMetrics } from 'prom-client';
import type { FastifyInstance } from 'fastify';
import { setupHttpMetrics } from './http-setup';

// ============================================================================
// Import all metric definitions to ensure they are registered with prom-client
// ============================================================================

import './http.metrics';
import './queue.metrics';
import './instance.metrics';
import './whatsapp.metrics';
import './database.metrics';
import './redis.metrics';
import './message-status.metrics';
import './workflow.metrics';

/**
 * Setup all metrics collectors and register Fastify endpoint.
 * Call this once during server startup.
 */
export async function setupMetrics(fastify: FastifyInstance): Promise<void> {
  // Collect default Node.js metrics every 10 seconds
  collectDefaultMetrics({
    prefix: 'whatsapp_platform_nodejs_',
  });

  // Register HTTP middleware hooks
  setupHttpMetrics(fastify);

  // Register metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    reply.type(register.contentType);
    try {
      return await register.metrics();
    } catch (err) {
      reply.code(500);
      return `# Error generating metrics: ${err}\n`;
    }
  });

  // Start collecting application-specific metrics
  startCollectors();
}

/**
 * Start background metric collectors (Redis, Prisma, queue polling).
 */
function startCollectors(): void {
  // TODO: Implement periodic collectors:
  // - Redis memory usage
  // - Prisma connection pool stats
  // - Instance heartbeat age distribution

  // For now, collectors will be called from their respective modules
}

/**
 * Get the global metrics registry (for testing/inspection).
 */
export function getMetricsRegistry() {
  return register;
}

/**
 * Reset all metrics (useful for testing).
 */
export function resetMetrics(): void {
  register.clear();
}
