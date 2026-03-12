/**
 * NEXTMAVENS WhatsApp Platform - Backend Server
 *
 * Fastify server hosting webhook endpoints and future API routes.
 *
 * Start: npm run dev
 */

import Fastify from 'fastify';
import * as http from 'http';
import { join } from 'path';
import { fileURLToPath } from 'url';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rawBody from 'fastify-raw-body';

// Import Prisma to ensure it's initialized
import { prisma, verifyDatabaseSetup } from './lib/prisma.js';

// Import middleware for global pipeline
import { authMiddleware } from './middleware/auth.ts';
import { orgGuard } from './middleware/orgGuard.ts';
import { getRateLimiter, generateIdentifier } from './lib/rate-limiting-with-redis/index.ts';
import { getQuotaLimiter, QuotaMetric } from './lib/implement-quota-enforcement-middleware/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // ============================================================================
  // GLOBAL PREHANDLER MIDDLEWARE PIPELINE
  // Order: auth -> orgGuard (RLS) -> rateLimit
  // ============================================================================
  app.addHook('preHandler', async (request, reply) => {
    // ------------------------------------------------------------------------
    // 1. Health check - bypass everything
    // ------------------------------------------------------------------------
    if (request.url === '/health') {
      return;
    }

    // ------------------------------------------------------------------------
    // 2. Evolution API webhooks - bypass auth & orgGuard (signature check in route)
    // ------------------------------------------------------------------------
    if (request.url?.startsWith('/api/webhooks/evolution')) {
      // Webhooks have their own signature verification in the route handler
      // Light rate limiting could be added here separately if needed
      return;
    }

    // ------------------------------------------------------------------------
    // 3. Authentication (JWT verification)
    // ------------------------------------------------------------------------
    try {
      await new Promise<void>((resolve, reject) => {
        authMiddleware(request, reply, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error: any) {
      return reply.code(401).send({ error: 'Unauthorized', message: error.message });
    }

    // ------------------------------------------------------------------------
    // 4. Organization Guard (RLS context)
    // ------------------------------------------------------------------------
    try {
      await new Promise<void>((resolve, reject) => {
        orgGuard(request, reply, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error: any) {
      return reply.code(403).send({ error: 'Forbidden', message: error.message });
    }

    // ------------------------------------------------------------------------
    // 5. Rate Limiting (skip admin endpoints)
    // ------------------------------------------------------------------------
    // Admin endpoints should not be rate-limited to prevent lockout
    if (request.url?.startsWith('/admin/rate-limiting') || request.url?.startsWith('/admin/quotas')) {
      return;
    }

    const limiter = getRateLimiter();
    if (limiter && limiter.config.enabled) {
      // Get endpoint pattern for rule matching
      const endpoint = (request.routerPath as string) || request.url;
      const orgId = (request as any).currentOrgId;
      const instanceId = (request as any).headers['x-instance-id']; // Optional: from header

      const rule = limiter.findRule(endpoint, orgId, instanceId);
      const identifier = generateIdentifier(request, orgId, instanceId);
      const result = await limiter.check(identifier, rule);

      // Add rate limit headers
      reply.header('X-RateLimit-Limit', rule.maxRequests.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + result.resetAfterMs / 1000).toString());

      if (!result.allowed) {
        return reply.code(429)
          .header('Retry-After', Math.ceil(result.resetAfterMs / 1000).toString())
          .send({
            error: 'Too many requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil(result.resetAfterMs / 1000)} seconds`,
            retryAfter: Math.ceil(result.resetAfterMs / 1000),
            limit: rule.maxRequests,
            windowMs: rule.windowMs
          });
      }
    }

    // ------------------------------------------------------------------------
    // 6. Quota Enforcement (global API calls quota)
    // ------------------------------------------------------------------------
    // Skip health, webhooks, and admin endpoints
    if (!request.url?.startsWith('/admin') && request.url !== '/health' && !request.url?.startsWith('/api/webhooks/evolution')) {
      try {
        const quotaLimiter = getQuotaLimiter();
        const orgId = (request as any).currentOrgId;
        if (orgId && quotaLimiter) {
          // Check API calls quota (1 per request)
          const result = await quotaLimiter.check(orgId, QuotaMetric.API_CALLS, 1);
          reply.header('X-Quota-Limit', result.limit.toString());
          reply.header('X-Quota-Remaining', result.remaining.toString());
          if (!result.allowed) {
            return reply.code(429)
              .header('Retry-After', Math.ceil((result.resetAt.getTime() - Date.now()) / 1000).toString())
              .send({
                error: 'Quota exceeded',
                message: `API quota limit exceeded. Reset at ${result.resetAt.toISOString()}`,
                quota: {
                  metric: 'api_calls',
                  current: result.current,
                  limit: result.limit,
                  remaining: result.remaining,
                  resetAt: result.resetAt.toISOString()
                }
              });
          }
        }
      } catch (err) {
        console.error('Quota middleware error:', err);
        // Fail open: allow request
      }
    }
  });

  // Security middleware
  await app.register(helmet);

  // CORS - configure appropriately for your frontend
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Raw body plugin for webhook signature verification
  await app.register(rawBody, { global: false }); // per-route usage

  // Health check
  app.get('/health', async (request, reply) => {
    const dbOk = await verifyDatabaseSetup();
    return {
      status: dbOk.ok ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbOk.ok ? 'connected' : 'error',
      errors: dbOk.errors,
    };
  });

  // Register Evolution API webhook routes
  const evolutionRoutes = await import('./app/api/integrate-evolution-api-message-status-webhooks/route.js');
  // @ts-ignore - dynamic import type mismatch
  app.register(evolutionRoutes.default || evolutionRoutes);

  // Register Retry Logic API routes (Step 4)
  const retryLogicRoutes = await import('./app/api/build-retry-logic-with-progressive-backoff/route.js');
  // @ts-ignore
  await app.register(retryLogicRoutes.default || retryLogicRoutes);

  // Register Advanced Phone Number Validation routes (Step 5)
  const phoneValidationRoutes = await import('./app/api/add-advanced-phone-number-validation/route.js');
  // @ts-ignore
  await app.register(phoneValidationRoutes.default || phoneValidationRoutes);

  // Register Message Deduplication System API routes (Step 6)
  const dedupRoutes = await import('./app/api/implement-message-deduplication-system/route.js');
  // @ts-ignore
  await app.register(dedupRoutes.default || dedupRoutes);

  // Register Message Delivery Receipts System API routes (Step 7)
  const receiptRoutes = await import('./app/api/build-message-delivery-receipts-system/route.js');
  // @ts-ignore
  await app.register(receiptRoutes.default || receiptRoutes);

  // Register Rate Limiting System API routes (Phase 1 Step 3)
  const rateLimitRoutes = await import('./app/api/rate-limiting-with-redis/route.js');
  // @ts-ignore
  await app.register(rateLimitRoutes.default || rateLimitRoutes);

  // Register Quota Enforcement System API routes (Phase 1 Step 6)
  const quotaRoutes = await import('./app/api/implement-quota-enforcement-middleware/route.js');
  // @ts-ignore
  await app.register(quotaRoutes.default || quotaRoutes);

  // Register Queue Priority System Admin API routes (Phase 2 Step 3 - Admin API)
  const queueAdminRoutes = await import('./app/api/implement-message-queue-priority-system/route.js');
  // @ts-ignore
  await app.register(queueAdminRoutes.default || queueAdminRoutes);

  // Register Webhook Dead Letter Queue Admin API routes (Phase 1 Step 5)
  const dlqAdminRoutes = await import('./app/api/build-webhook-dead-letter-queue-(dlq)-system/route.js');
  // @ts-ignore
  await app.register(dlqAdminRoutes.default || dlqAdminRoutes);

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: 'Not Found' });
  });

  return app;
}

// Helper to get __dirname in ES modules
function dirname(path: string): string {
  return path.substring(0, path.lastIndexOf('/'));
}

// Start server
const start = async () => {
  try {
    const app = await buildServer();
    const port = parseInt(process.env.PORT || '3000', 10);

    // Create HTTP server and attach Socket.IO
    // @ts-ignore - Fastify instance compatible with http.ServerRequestListener
    const server = http.createServer(app);

    // Initialize Socket.IO with Redis adapter
    try {
      const { initializeSocket } = await import('./lib/build-real-time-messaging-with-socket.io/index.js');
      await initializeSocket(server);
      console.log("🔌 Socket.IO initialized");
    } catch (err) {
      console.error("⚠️ Failed to initialize Socket.IO:", err);
      // Continue without Socket.IO - logging only
    }

    // @ts-ignore - listen options acceptable
    server.listen({ port, host: '0.0.0.0' }, (err, address) => {
      if (err) {
        app.log.error(err);
        process.exit(1);
      }
      app.log.info(`Server listening on ${address}`);
      console.log(`🚀 WhatsApp Platform Backend running on port ${port}`);
      console.log(`📡 Webhook endpoint: POST /api/webhooks/evolution`);
      console.log(`🔌 WebSocket endpoint: ws://${address}/socket.io/`);
      console.log(`🔐 Health check: GET /health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// If this file is the main entry point, start the server
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}

export { buildServer };
