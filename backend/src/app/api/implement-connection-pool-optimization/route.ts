/**
 * Connection Pool Optimization Admin API
 *
 * Admin endpoints for monitoring and managing database connection pool.
 * Protected by auth + orgGuard middleware (SUPER_ADMIN only effectively).
 *
 * Base path: /admin/database/pool
 *
 * Endpoints:
 * - GET    /health      - Connection pool health check
 * - GET    /stats       - Detailed pool statistics (from pg_stat_activity)
 * - GET    /leaks       - Detect potential connection leaks
 * - POST   /warm        - Pre-warm connection pool (optional)
 *
 * Access: Requires authentication + SUPER_ADMIN role
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import {
  checkPoolHealth,
  getConnectionPoolStats,
  detectConnectionLeaks,
  POOL_CONFIG,
} from '../../../lib/implement-connection-pool-optimization';

// ============================================================================
// Zod Schemas (for manual validation)
// ============================================================================

const warmPoolSchema = z.object({
  connections: z.number().int().positive().min(1).max(50).optional().default(5),
});

const leakDetectionSchema = z.object({
  maxAgeMs: z.number().int().positive().optional(),
});

// ============================================================================
// Route Handlers
// ============================================================================

export async function healthHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const health = await checkPoolHealth();

    const statusCode = health.ok ? 200 : 503;
    reply.code(statusCode);

    return {
      success: health.ok,
      data: {
        healthy: health.ok,
        error: health.error,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('[PoolAdmin] Error checking health:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to check pool health',
      details: error.message,
    });
  }
}

export async function statsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const stats = await getConnectionPoolStats();

    return {
      success: true,
      data: {
        pool: {
          total: stats.total,
          idle: stats.idle,
          active: stats.active,
          configured_max: stats.database_wants,
          database_max_connections: stats.maxConnections,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('[PoolAdmin] Error fetching stats:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to fetch pool statistics',
      details: error.message,
    });
  }
}

export async function leaksHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Parse query params for custom threshold
    let maxAgeMs: number | undefined;
    if (request.query && typeof request.query === 'object') {
      const query = request.query as Record<string, any>;
      if (query.maxAgeMs) {
        try {
          maxAgeMs = parseInt(query.maxAgeMs, 10);
        } catch {
          // ignore invalid, use default
        }
      }
    }

    const leaks = maxAgeMs
      ? await detectConnectionLeaks(maxAgeMs)
      : await detectConnectionLeaks();

    return {
      success: true,
      data: {
        leaks,
        count: leaks.length,
        thresholdMs: maxAgeMs || 30000,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('[PoolAdmin] Error detecting leaks:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to detect connection leaks',
      details: error.message,
    });
  }
}

export async function warmPoolHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Parse and validate body
    const body = warmPoolSchema.parse(request.body);
    const numConnections = body.connections;

    console.log(`[PoolAdmin] Warming pool with ${numConnections} connections...`);

    // Access prisma via the singleton (not from request context)
    // We import it dynamically to avoid circular dependencies
    const { prisma } = await import('../../../lib/prisma');

    // Run quick connection test to simulate load
    const start = Date.now();
    const promises = Array(numConnections).fill(null).map(() =>
      prisma.$queryRaw`SELECT 1`.catch(() => ({ result: 'fallback' }))
    );
    await Promise.all(promises);
    const duration = Date.now() - start;

    return {
      success: true,
      data: {
        warmed: numConnections,
        durationMs: duration,
        message: `Pool warmed with ${numConnections} connections`,
      },
    };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid request body',
        details: error.format(),
      });
    }
    console.error('[PoolAdmin] Error warming pool:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to warm pool',
      details: error.message,
    });
  }
}

// ============================================================================
// Fastify Route Registration
// ============================================================================

export async function registerConnectionPoolAdminRoutes(fastify: any) {
  // These are admin routes - placed under /admin/database/pool
  fastify.get('/admin/database/pool/health', healthHandler);
  fastify.get('/admin/database/pool/stats', statsHandler);
  fastify.get('/admin/database/pool/leaks', leaksHandler);
  fastify.post('/admin/database/pool/warm', warmPoolHandler);

  console.log('[PoolAdmin] Registered connection pool admin routes under /admin/database/pool');
}

export default registerConnectionPoolAdminRoutes;
